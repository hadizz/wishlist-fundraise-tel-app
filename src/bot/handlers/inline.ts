import { and, eq, sql } from "drizzle-orm";
import { Composer, InlineKeyboard, InlineQueryResultBuilder } from "grammy";
import { db } from "../../db/client";
import { wishlists } from "../../db/schema";
import { miniAppLink } from "../../lib/telegram";
import type { BotContext } from "../context";

/**
 * Inline mode (@bot in any chat): share one of my non-private wishlists or my
 * profile as a card with an "Open" button. Requires inline mode enabled in
 * @BotFather. Visibility is still enforced when the recipient opens the link.
 */
export const inline = new Composer<BotContext>();

inline.on("inline_query", async (ctx) => {
  const me = ctx.dbUser!;
  const q = ctx.inlineQuery.query.trim();
  const lists = await db
    .select()
    .from(wishlists)
    .where(and(
      eq(wishlists.ownerId, me.id),
      sql`${wishlists.visibility} <> 'private'`,
      sql`${wishlists.archivedAt} is null`,
      q ? sql`${wishlists.title} ilike ${"%" + q.replace(/[%_\\]/g, "\\$&") + "%"}` : undefined,
    ))
    .orderBy(wishlists.position)
    .limit(20);

  const results = [
    InlineQueryResultBuilder.article(`profile`, "🎁 Share my profile", {
      description: "All the wishlists I've shared with you",
      reply_markup: new InlineKeyboard().url("Open wishlists", miniAppLink(`u_${me.id}`)),
    }).text(`🎁 ${me.firstName}'s wishlists`),
    ...lists.map((w) =>
      InlineQueryResultBuilder.article(`w:${w.id}`, `${w.emoji ?? "📝"} ${w.title}`, {
        description: w.description ?? undefined,
        reply_markup: new InlineKeyboard().url("Open wishlist", miniAppLink(`w_${w.id}`)),
      }).text(`${w.emoji ?? "🎁"} ${me.firstName}'s wishlist: ${w.title}`),
    ),
  ];
  await ctx.answerInlineQuery(results, { cache_time: 10, is_personal: true });
});
