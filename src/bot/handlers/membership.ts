import { eq } from "drizzle-orm";
import { Composer } from "grammy";
import { db } from "../../db/client";
import { groupSessions, telegramChats, users } from "../../db/schema";
import type { BotContext } from "../context";

/**
 * my_chat_member: the bot's own membership changed.
 *   private chat: user blocked/unblocked the bot -> users.can_dm
 *   group:        bot added/promoted/removed     -> telegram_chats + greeting
 * Requires "my_chat_member" in allowed_updates (see index.ts).
 */
export const membership = new Composer<BotContext>();

membership.on("my_chat_member", async (ctx) => {
  const { chat, new_chat_member: m, from } = ctx.myChatMember;
  const status = m.status === "creator" ? "administrator" : m.status === "restricted" ? "member" : m.status;

  if (chat.type === "private") {
    await db.update(users).set({ canDm: status === "member" }).where(eq(users.telegramId, chat.id));
    return;
  }
  if (chat.type === "channel") return;

  const botStatus = status as "member" | "administrator" | "left" | "kicked";
  await db
    .insert(telegramChats)
    .values({ chatId: chat.id, type: chat.type, title: chat.title, botStatus, addedByUserId: ctx.dbUser?.id ?? null })
    .onConflictDoUpdate({ target: telegramChats.chatId, set: { title: chat.title, botStatus } });

  const wasIn = ["member", "administrator", "creator", "restricted"].includes(ctx.myChatMember.old_chat_member.status);
  if (!wasIn && (botStatus === "member" || botStatus === "administrator")) {
    await ctx.reply(
      `Hi! I help this group gift together 🎁\n` +
        `Type /fundraise @username to vote on one of their wishes, then chip in with Stars.\n` +
        `Thanks ${from.first_name} for adding me.`,
    );
  }
});

/** Supergroup migration: chat id changes; keep sessions attached. */
membership.on("message:migrate_to_chat_id", async (ctx) => {
  const newId = ctx.message.migrate_to_chat_id;
  await db.transaction(async (tx) => {
    const [old] = await tx.select().from(telegramChats).where(eq(telegramChats.chatId, ctx.chat.id));
    if (!old) return;
    await tx.insert(telegramChats).values({ ...old, chatId: newId, type: "supergroup" }).onConflictDoNothing();
    await tx.update(groupSessions).set({ telegramChatId: newId }).where(eq(groupSessions.telegramChatId, ctx.chat.id));
    await tx.update(telegramChats).set({ botStatus: "left" }).where(eq(telegramChats.chatId, ctx.chat.id));
  });
});
