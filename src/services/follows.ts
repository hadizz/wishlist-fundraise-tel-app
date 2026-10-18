import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import type { DB } from "../db/client";
import { follows } from "../db/schema";
import { enqueue } from "./outbox";

/** Accept/decline a pending follow request. Shared by the API and the bot DM buttons. */
export async function respondToFollow(db: DB, followeeId: string, followerId: string, accept: boolean) {
  return db.transaction(async (tx) => {
    const [row] = await tx.update(follows)
      .set({ status: accept ? "accepted" : "rejected", respondedAt: new Date() })
      .where(and(eq(follows.followerId, followerId), eq(follows.followeeId, followeeId), eq(follows.status, "pending")))
      .returning();
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "follow request not found" });
    if (accept) await enqueue(tx, { kind: "follow_accepted", userId: followerId, payload: { followeeId } });
    return { status: row.status };
  });
}
