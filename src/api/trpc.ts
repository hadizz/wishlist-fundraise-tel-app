import { initTRPC, TRPCError } from "@trpc/server";
import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { eq } from "drizzle-orm";
import superjson from "superjson";
import { db } from "../db/client";
import { users } from "../db/schema";
import { env } from "../env";
import { InitDataError, validateInitData, type InitData } from "../lib/init-data";
import { rateLimit } from "../lib/redis";
import { ContributionError } from "../services/contributions";
import { upsertTelegramUser } from "../services/users";

/**
 * Auth: every request carries the raw Mini App initData:
 *
 *   Authorization: tma <window.Telegram.WebApp.initData>
 *
 * It is HMAC-verified on each call (cheap, stateless, no session store).
 * auth_date older than INIT_DATA_MAX_AGE_SECONDS is rejected; the client
 * should reload the Mini App to get fresh initData.
 */
export async function createContext({ req }: FetchCreateContextFnOptions) {
  const header = req.headers.get("authorization") ?? "";
  let initData: InitData | null = null;
  let authError: string | null = null;
  if (header.startsWith("tma ")) {
    try {
      initData = validateInitData(header.slice(4), env.BOT_TOKEN, env.INIT_DATA_MAX_AGE_SECONDS);
    } catch (e) {
      authError = e instanceof InitDataError ? e.message : "invalid initData";
    }
  }
  return { db, initData, authError };
}

type Context = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter: ({ shape }) => shape,
});

export const router = t.router;

/** Maps domain errors to tRPC codes. */
const errorMapping = t.middleware(async ({ next }) => {
  const res = await next();
  if (!res.ok && res.error.cause instanceof ContributionError) {
    const msg = res.error.cause.message;
    throw new TRPCError({
      code: msg === "forbidden" ? "FORBIDDEN" : msg.endsWith("not found") ? "NOT_FOUND" : "CONFLICT",
      message: msg,
    });
  }
  return res;
});

export const publicProcedure = t.procedure.use(errorMapping);

/** Requires valid initData; resolves (and lazily creates) the DB user. */
export const authedProcedure = publicProcedure.use(async ({ ctx, next }) => {
  if (!ctx.initData) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: ctx.authError ?? "missing initData" });
  }
  const tgUser = ctx.initData.user;
  if (!(await rateLimit(`u:${tgUser.id}`, env.RATE_LIMIT_PER_MINUTE))) {
    throw new TRPCError({ code: "TOO_MANY_REQUESTS" });
  }
  let [user] = await ctx.db.select().from(users).where(eq(users.telegramId, tgUser.id));
  user ??= await upsertTelegramUser(ctx.db, tgUser);
  return next({ ctx: { ...ctx, initData: ctx.initData, user } });
});
