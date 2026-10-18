import { autoRetry } from "@grammyjs/auto-retry";
import { eq } from "drizzle-orm";
import { Bot } from "grammy";
import { db } from "../db/client";
import { users } from "../db/schema";
import { env } from "../env";
import { upsertTelegramUser } from "../services/users";
import { groupCommands } from "./commands/group";
import { privateCommands } from "./commands/private";
import type { BotContext } from "./context";
import { callbacks } from "./handlers/callbacks";
import { inline } from "./handlers/inline";
import { membership } from "./handlers/membership";
import { payments } from "./handlers/payments";

export function createBot() {
  const bot = new Bot<BotContext>(env.BOT_TOKEN);
  bot.api.config.use(autoRetry({ maxRetryAttempts: 3, maxDelaySeconds: 10 }));

  // Resolve the acting user for every update that has one.
  bot.use(async (ctx, next) => {
    if (ctx.from && !ctx.from.is_bot) {
      ctx.dbUser = await upsertTelegramUser(db, ctx.from);
      // Any private message means the user has started the bot and can be DMed.
      if (ctx.chat?.type === "private" && ctx.message && !ctx.dbUser.canDm) {
        await db.update(users).set({ canDm: true }).where(eq(users.id, ctx.dbUser.id));
        ctx.dbUser.canDm = true;
      }
    }
    await next();
  });

  // Order matters: payments first (pre_checkout has a 10 s deadline).
  bot.use(payments, membership, privateCommands, groupCommands, inline, callbacks);

  bot.catch((err) => {
    console.error(`update ${err.ctx.update.update_id} failed:`, err.error);
    // Re-throw payment failures so the webhook returns 500 and Telegram redelivers.
    if (err.ctx.message?.successful_payment) throw err.error;
  });
  return bot;
}

/** Command menus per scope (shown in the Telegram "/" picker). */
export async function registerCommands(bot: Bot<BotContext>) {
  await bot.api.setMyCommands(
    [
      { command: "app", description: "Open my wishlists" },
      { command: "mylists", description: "List my wishlists" },
      { command: "requests", description: "Follow requests" },
      { command: "pending", description: "Payments to confirm" },
      { command: "settings", description: "Notification settings" },
      { command: "paysupport", description: "Help with a Stars payment" },
      { command: "help", description: "How it works" },
    ],
    { scope: { type: "all_private_chats" } },
  );
  await bot.api.setMyCommands(
    [
      { command: "fundraise", description: "Start a group gift: /fundraise @user" },
      { command: "status", description: "Show group gift progress" },
      { command: "contribute", description: "Chip in Stars: /contribute 100" },
      { command: "close", description: "Close the group gift" },
      { command: "help", description: "How group gifts work" },
    ],
    { scope: { type: "all_group_chats" } },
  );
}
