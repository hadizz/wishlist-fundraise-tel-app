import type { Context } from "grammy";
import type { User } from "../db/schema";

export interface BotContext extends Context {
  /** Resolved for every update with a `from` user (see bot.ts middleware). */
  dbUser?: User;
}
