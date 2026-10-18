import { and, eq } from "drizzle-orm";
import type { Executor } from "../db/client";
import { follows, users, type Wishlist } from "../db/schema";

/**
 * Visibility rules (single place, used by API and bot):
 *
 *  - owner sees everything
 *  - "private"   -> owner only
 *  - "followers" -> accepted followers
 *  - "public"    -> anyone, UNLESS the owner's profile is private, in which
 *                   case it behaves like "followers"
 *
 * Group chats have no viewer identity: they only ever see "public" lists of
 * public profiles (see wishlistsVisibleInGroup).
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
  if (list.archivedAt || list.visibility === "private") return false;
  if (list.visibility === "public") {
    const [owner] = await db.select({ p: users.profilePublic }).from(users).where(eq(users.id, list.ownerId));
    if (owner?.p) return true;
  }
  return viewerId !== null && isAcceptedFollower(db, viewerId, list.ownerId);
}
