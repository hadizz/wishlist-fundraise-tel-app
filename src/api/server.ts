import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { sql } from "drizzle-orm";
import { db } from "../db/client";
import { env } from "../env";
import { redis } from "../lib/redis";
import { appRouter } from "./routers";
import { createContext } from "./trpc";

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  if (!origin || !env.CORS_ORIGINS.includes(origin)) return {};
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-headers": "authorization, content-type, trpc-accept",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-max-age": "600",
    vary: "origin",
  };
}

const server = Bun.serve({
  port: env.API_PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const headers = cors(req);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });

    if (url.pathname === "/healthz") return new Response("ok");
    if (url.pathname === "/readyz") {
      try {
        await Promise.all([db.execute(sql`select 1`), redis.ping()]);
        return new Response("ready");
      } catch {
        return new Response("not ready", { status: 503 });
      }
    }

    if (url.pathname.startsWith("/trpc")) {
      const res = await fetchRequestHandler({
        endpoint: "/trpc",
        req,
        router: appRouter,
        createContext,
        onError: ({ error, path }) => {
          if (error.code === "INTERNAL_SERVER_ERROR") console.error(`trpc ${path}:`, error.cause ?? error);
        },
      });
      for (const [k, v] of Object.entries(headers)) res.headers.set(k, v);
      return res;
    }
    return new Response("not found", { status: 404 });
  },
});

console.log(`api listening on :${server.port}`);
