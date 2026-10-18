import { and, eq } from "drizzle-orm";
import type { Executor } from "../db/client";
import { follows, type Wishlist } from "../db/schema";

/**
 * Visibility rules (single place, used by API and bot):
 *
 *  - owner sees everything
 *  - "public"  -> anyone
 *  - "private" -> followers the owner accepted
 *  - archived  -> owner only
 *
 * Group chats have no viewer identity, so they only ever see "public" lists.
 */
export async function isAcceptedFollower(db: Executor, viewerId: string, ownerId: string) {
  const [row] = await db
    .select({ s: follows.status })
    .from(follows)
    .where(and(eq(follows.followerId, viewerId), eq(follows.followeeId, ownerId)));
  return row?.s === "accepted";
}

export async function canViewWishlist(
  db: Executor,
  viewerId: string | null,
  list: Pick<Wishlist, "ownerId" | "visibility" | "archivedAt">,
): Promise<boolean> {
  if (viewerId === list.ownerId) return true;
  if (list.archivedAt) return false;
  if (list.visibility === "public") return true;
  return viewerId !== null && isAcceptedFollower(db, viewerId, list.ownerId);
}
