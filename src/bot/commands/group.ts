import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { Composer } from "grammy";
import { db } from "../../db/client";
import { groupSessions, products, telegramChats, users, wishlists, type GroupSession } from "../../db/schema";
import { env } from "../../env";
import type { BotContext } from "../context";
import { renderSession } from "../render";
import { sendSessionInvoice } from "../handlers/payments";

/**
 * Group-chat commands. All require the bot to be a member of a group or
 * supergroup. Group chats see only "public" wishlists of public profiles
 * (there is no single viewer identity to check follower access against).
 */
export const groupCommands = new Composer<BotContext>().chatType(["group", "supergroup"]);

const MAX_CANDIDATES = 10;

async function upsertChat(ctx: BotContext) {
  const chat = ctx.chat!;
  await db
    .insert(telegramChats)
    .values({ chatId: chat.id, type: chat.type, title: "title" in chat ? chat.title : null, botStatus: "member" })
    .onConflictDoUpdate({ target: telegramChats.chatId, set: { title: "title" in chat ? chat.title : null } });
}

export async function activeSession(chatId: number): Promise<GroupSession | undefined> {
  const [s] = await db
    .select()
    .from(groupSessions)
    .where(and(eq(groupSessions.telegramChatId, chatId), inArray(groupSessions.status, ["voting", "open"])));
  return s;
}

/** Post the session message and remember its id for live edits. */
export async function postSessionMessage(ctx: BotContext, sessionId: string) {
  const r = await renderSession(db, sessionId);
  if (!r) return;
  const msg = await ctx.reply(r.text, { parse_mode: "HTML", reply_markup: r.keyboard });
  await db.update(groupSessions).set({ progressMessageId: msg.message_id }).where(eq(groupSessions.id, sessionId));
}

async function isChatAdmin(ctx: BotContext): Promise<boolean> {
  const m = await ctx.getChatMember(ctx.from!.id);
  return m.status === "creator" || m.status === "administrator";
}

/** Creator of the session or a chat admin may start/close it. */
export async function canManageSession(ctx: BotContext, s: GroupSession): Promise<boolean> {
  return s.createdById === ctx.dbUser?.id || (await isChatAdmin(ctx));
}

/**
 * /fundraise @username [n]
 *   no n -> list the person's public items and open a vote
 *   n    -> start collecting for item n immediately
 */
groupCommands.command("fundraise", async (ctx) => {
  await upsertChat(ctx);
  const [handle, nRaw] = ctx.match.trim().split(/\s+/);
  const username = handle?.replace(/^@/, "");
  if (!username) return ctx.reply("Usage: /fundraise @username [item number]");

  const existing = await activeSession(ctx.chat.id);
  if (existing) {
    await ctx.reply("There is already an active group gift in this chat. Use /status or /close first.");
    return postSessionMessage(ctx, existing.id);
  }

  const [beneficiary] = await db.select().from(users).where(sql`lower(${users.username}) = lower(${username})`);
  if (!beneficiary) {
    return ctx.reply(
      `@${username} has not set up a wishlist yet. Ask them to open https://t.me/${env.BOT_USERNAME} first.`,
    );
  }
  if (beneficiary.id === ctx.dbUser?.id) return ctx.reply("You can't start a group gift for yourself 🙂");

  const items = beneficiary.profilePublic
    ? await db
        .select({ id: products.id })
        .from(products)
        .innerJoin(wishlists, eq(wishlists.id, products.wishlistId))
        .where(and(
          eq(wishlists.ownerId, beneficiary.id),
          eq(wishlists.visibility, "public"),
          sql`${wishlists.archivedAt} is null`,
          eq(products.status, "active"),
        ))
        .orderBy(asc(wishlists.position), sql`${products.priority} desc`, asc(products.position))
        .limit(MAX_CANDIDATES)
    : [];
  if (items.length === 0) {
    return ctx.reply(`@${username} has no public wishes collecting right now.`);
  }

  const n = nRaw ? Number(nRaw) : null;
  if (n !== null && (!Number.isInteger(n) || n < 1 || n > items.length)) {
    return ctx.reply(`Pick an item number between 1 and ${items.length}.`);
  }

  const [s] = await db
    .insert(groupSessions)
    .values({
      telegramChatId: ctx.chat.id,
      beneficiaryId: beneficiary.id,
      createdById: ctx.dbUser!.id,
      candidateProductIds: items.map((i) => i.id),
      ...(n ? { status: "open" as const, productId: items[n - 1]!.id } : {}),
    })
    .onConflictDoNothing() // lost a race with another /fundraise
    .returning();
  if (!s) return ctx.reply("A group gift was just started here. Use /status.");
  await postSessionMessage(ctx, s.id);
});

/** /status — re-post the live progress/vote message (old one may be far up the chat). */
groupCommands.command("status", async (ctx) => {
  const s = await activeSession(ctx.chat.id);
  if (!s) return ctx.reply("No active group gift. Start one with /fundraise @username");
  await postSessionMessage(ctx, s.id);
});

/** /contribute <stars> — sends a Stars invoice for the open session. */
groupCommands.command("contribute", async (ctx) => {
  const s = await activeSession(ctx.chat.id);
  if (!s || s.status !== "open") return ctx.reply("No group gift is collecting right now.");
  const stars = Number(ctx.match.trim());
  if (!Number.isInteger(stars) || stars < env.STARS_MIN || stars > env.STARS_MAX) {
    return ctx.reply(`Usage: /contribute <stars>  (${env.STARS_MIN}–${env.STARS_MAX})`);
  }
  await sendSessionInvoice(ctx, s, stars);
});

/** /close — stop collecting (creator or admin). Confirmed money stays credited to the product. */
groupCommands.command(["close", "cancel"], async (ctx) => {
  const s = await activeSession(ctx.chat.id);
  if (!s) return ctx.reply("No active group gift.");
  if (!(await canManageSession(ctx, s))) return ctx.reply("Only the person who started it or a chat admin can close it.");
  await closeSession(s);
  await postSessionMessage(ctx, s.id);
});

export async function closeSession(s: GroupSession) {
  await db
    .update(groupSessions)
    .set({ status: s.status === "voting" ? "cancelled" : "closed", closedAt: new Date() })
    .where(and(eq(groupSessions.id, s.id), inArray(groupSessions.status, ["voting", "open"])));
}

groupCommands.command("help", (ctx) =>
  ctx.reply(
    [
      "🎁 <b>Group gifts</b>",
      "/fundraise @user — vote on one of their public wishes",
      "/fundraise @user 2 — collect for item 2 right away",
      "/status — show progress",
      "/contribute 100 — chip in 100 ⭐",
      "/close — stop collecting (starter or admin)",
    ].join("\n"),
    { parse_mode: "HTML" },
  ),
);
