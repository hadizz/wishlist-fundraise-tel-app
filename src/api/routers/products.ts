import { TRPCError } from "@trpc/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { contributions, groupSessions, products } from "../../db/schema";
import { env } from "../../env";
import { ALLOWED_IMAGE_TYPES, presignImageUpload } from "../../lib/storage";
import { assertCanAddProduct } from "../../lib/entitlements";
import { authedProcedure, router } from "../trpc";
import { currency, httpUrl, id, money, ownedProduct, ownedWishlist, readableProduct } from "./_shared";

const fields = {
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2000).nullish(),
  url: httpUrl.nullish(),
  imageUrl: httpUrl.nullish(),
  priceMinor: money,
  currency,
  priority: z.number().int().min(0).max(3).default(0),
};

export const productsRouter = router({
  /** Product detail + public contribution feed summary + active group sessions. */
  get: authedProcedure.input(z.object({ productId: id })).query(async ({ ctx, input }) => {
    const { product, wishlist } = await readableProduct(ctx.db, ctx.user.id, input.productId);
    const [stats] = await ctx.db
      .select({
        contributors: sql<number>`count(distinct ${contributions.contributorId})::int`,
        pendingManualMinor: sql<number>`coalesce(sum(${contributions.amountMinor}) filter (where ${contributions.status} = 'awaiting_confirmation'), 0)::bigint`,
      })
      .from(contributions)
      .where(and(eq(contributions.productId, product.id), inArray(contributions.status, ["confirmed", "awaiting_confirmation"])));
    const sessions = await ctx.db
      .select({ id: groupSessions.id, status: groupSessions.status, chatId: groupSessions.telegramChatId })
      .from(groupSessions)
      .where(and(eq(groupSessions.productId, product.id), eq(groupSessions.status, "open")));
    return {
      product,
      wishlist: { id: wishlist.id, title: wishlist.title, ownerId: wishlist.ownerId },
      isOwner: wishlist.ownerId === ctx.user.id,
      contributorCount: stats?.contributors ?? 0,
      pendingManualMinor: Number(stats?.pendingManualMinor ?? 0),
      activeSessionCount: sessions.length,
    };
  }),

  /** Manual entry only (no URL scraping in v1). Plan limit: FORBIDDEN "plan_limit:products_per_wishlist". */
  create: authedProcedure
    .input(z.object({ wishlistId: id, ...fields }))
    .mutation(async ({ ctx, input }) => {
      await ownedWishlist(ctx.db, ctx.user.id, input.wishlistId);
      await assertCanAddProduct(ctx.db, ctx.user.id, input.wishlistId);
      if (input.currency !== "XTR" && !env.STARS_RATES[input.currency]) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `currency ${input.currency} is not supported` });
      }
      const [p] = await ctx.db
        .insert(products)
        .values({
          ...input,
          position: sql`coalesce((select max(position) + 1 from products where wishlist_id = ${input.wishlistId}), 0)`,
        })
        .returning();
      return p!;
    }),

  /** Price/currency are locked once any contribution is confirmed (funded_minor is in that currency). */
  update: authedProcedure
    .input(z.object({ productId: id, ...z.object(fields).partial().shape }))
    .mutation(async ({ ctx, input: { productId, ...patch } }) => {
      const { product } = await ownedProduct(ctx.db, ctx.user.id, productId);
      if (patch.currency && patch.currency !== product.currency && product.fundedMinor > 0) {
        throw new TRPCError({ code: "CONFLICT", message: "currency is locked after the first contribution" });
      }
      const priceMinor = patch.priceMinor ?? product.priceMinor;
      const status =
        product.status === "active" && product.fundedMinor >= priceMinor ? "funded"
        : product.status === "funded" && product.fundedMinor < priceMinor ? "active"
        : product.status;
      const [p] = await ctx.db.update(products).set({ ...patch, status }).where(eq(products.id, productId)).returning();
      return p!;
    }),

  /** Owner marks the gift as bought, or archives it (stops collection; history kept). */
  setStatus: authedProcedure
    .input(z.object({ productId: id, status: z.enum(["purchased", "archived", "active"]) }))
    .mutation(async ({ ctx, input }) => {
      const { product } = await ownedProduct(ctx.db, ctx.user.id, input.productId);
      if (product.status === "archived" && input.status !== "archived") {
        await assertCanAddProduct(ctx.db, ctx.user.id, product.wishlistId);
      }
      const status = input.status === "active" && product.fundedMinor >= product.priceMinor ? "funded" : input.status;
      const [p] = await ctx.db.transaction(async (tx) => {
        if (status !== "active" && status !== "funded") {
          await tx
            .update(groupSessions)
            .set({ status: "closed", closedAt: new Date() })
            .where(and(eq(groupSessions.productId, product.id), eq(groupSessions.status, "open")));
        }
        return tx.update(products).set({ status }).where(eq(products.id, product.id)).returning();
      });
      return p!;
    }),

  /** Hard delete only while nothing was ever contributed; otherwise use setStatus(archived). */
  delete: authedProcedure.input(z.object({ productId: id })).mutation(async ({ ctx, input }) => {
    await ownedProduct(ctx.db, ctx.user.id, input.productId);
    const [any] = await ctx.db.select({ id: contributions.id }).from(contributions)
      .where(eq(contributions.productId, input.productId)).limit(1);
    if (any) throw new TRPCError({ code: "CONFLICT", message: "product has contributions; archive it instead" });
    await ctx.db.delete(products).where(eq(products.id, input.productId));
    return { ok: true };
  }),

  reorder: authedProcedure
    .input(z.object({ wishlistId: id, orderedIds: z.array(id).min(1).max(500) }))
    .mutation(async ({ ctx, input }) => {
      await ownedWishlist(ctx.db, ctx.user.id, input.wishlistId);
      await ctx.db.transaction(async (tx) => {
        for (const [i, pid] of input.orderedIds.entries()) {
          await tx.update(products).set({ position: i })
            .where(and(eq(products.id, pid), eq(products.wishlistId, input.wishlistId)));
        }
      });
      return { ok: true };
    }),

  /** Presigned PUT for a product image; client uploads directly, then sends publicUrl as imageUrl. */
  presignImage: authedProcedure
    .input(z.object({ contentType: z.enum(ALLOWED_IMAGE_TYPES), contentLength: z.number().int().positive().max(env.UPLOAD_MAX_BYTES) }))
    .mutation(({ ctx, input }) => presignImageUpload(ctx.user.id, input.contentType, input.contentLength)),

  /** Recently funded items from people I follow — feed for the home tab. */
  recentlyFundedFeed: authedProcedure.query(({ ctx }) =>
    ctx.db.execute(sql`
      select p.*, w.owner_id from products p
      join wishlists w on w.id = p.wishlist_id
      join follows f on f.followee_id = w.owner_id and f.follower_id = ${ctx.user.id} and f.status = 'accepted'
      where p.status = 'funded' and w.archived_at is null
      order by p.funded_at desc limit 30`),
  ),
});
