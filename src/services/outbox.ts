import { sql } from "drizzle-orm";
import type { Executor } from "../db/client";
import { notificationOutbox } from "../db/schema";

/** Every notification the system can emit. Payload shapes are the contract with the bot worker. */
export type OutboxMessage =
  | { kind: "follow_request"; userId: string; payload: { followerId: string } }
  | { kind: "follow_accepted"; userId: string; payload: { followeeId: string } }
  | { kind: "contribution_received"; userId: string; payload: { contributionId: string } }
  | { kind: "manual_claim"; userId: string; payload: { contributionId: string } }
  | { kind: "manual_decided"; userId: string; payload: { contributionId: string } }
  | { kind: "product_funded"; userId: string; payload: { productId: string } }
  | { kind: "group_progress"; chatId: number; payload: { sessionId: string } };

/** Insert inside the caller's transaction. group_progress collapses to one pending row per session. */
export async function enqueue(db: Executor, msg: OutboxMessage): Promise<void> {
  const dedupeKey = msg.kind === "group_progress" ? `group_progress:${msg.payload.sessionId}` : null;
  await db
    .insert(notificationOutbox)
    .values({
      kind: msg.kind,
      userId: "userId" in msg ? msg.userId : null,
      chatId: "chatId" in msg ? msg.chatId : null,
      payload: msg.payload,
      dedupeKey,
      // Small delay on group edits so a burst of payments becomes one edit.
      nextAttemptAt: dedupeKey ? sql`now() + interval '2 seconds'` : sql`now()`,
    })
    .onConflictDoNothing({
      target: notificationOutbox.dedupeKey,
      where: sql`${notificationOutbox.status} = 'pending'`,
    });
}
