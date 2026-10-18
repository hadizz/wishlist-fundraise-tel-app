import { webhookCallback } from "grammy";
import { sql } from "drizzle-orm";
import { db } from "../db/client";
import { env } from "../env";
import { redis } from "../lib/redis";
import { createBot, registerCommands } from "./bot";
import { startOutboxWorker } from "./notifications/worker";

const ALLOWED_UPDATES = [
  "message",
  "callback_query",
  "inline_query",
  "pre_checkout_query",
  "my_chat_member",
] as const;

const bot = createBot();
await bot.init();
await registerCommands(bot);
const stopWorker = startOutboxWorker(bot.api);

if (env.BOT_MODE === "polling") {
  // Local development only. Removes any webhook so getUpdates works.
  await bot.api.deleteWebhook();
  void bot.start({ allowed_updates: ALLOWED_UPDATES, onStart: (me) => console.log(`polling as @${me.username}`) });
} else {
  const path = `/telegram/webhook`;
  await bot.api.setWebhook(new URL(path, env.WEBHOOK_PUBLIC_URL).toString(), {
    secret_token: env.WEBHOOK_SECRET,
    allowed_updates: ALLOWED_UPDATES,
    drop_pending_updates: false,
    max_connections: 40,
  });
  // Checks X-Telegram-Bot-Api-Secret-Token; returns 401 on mismatch.
  const handle = webhookCallback(bot, "std/http", { secretToken: env.WEBHOOK_SECRET, timeoutMilliseconds: 9_000 });
  Bun.serve({
    port: env.BOT_PORT,
    async fetch(req) {
      const { pathname } = new URL(req.url);
      if (pathname === "/healthz") return new Response("ok");
      if (pathname === "/readyz") {
        try {
          await Promise.all([db.execute(sql`select 1`), redis.ping()]);
          return new Response("ready");
        } catch {
          return new Response("not ready", { status: 503 });
        }
      }
      if (req.method === "POST" && pathname === path) return handle(req);
      return new Response("not found", { status: 404 });
    },
  });
  console.log(`bot webhook listening on :${env.BOT_PORT}${path}`);
}

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, async () => {
    stopWorker();
    if (env.BOT_MODE === "polling") await bot.stop();
    process.exit(0);
  });
}
