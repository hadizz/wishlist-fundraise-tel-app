import { parseStartParam } from "../../lib/telegram";
import { upsertTelegramUser } from "../../services/users";
import { authedProcedure, router } from "../trpc";

export const authRouter = router({
  /**
   * Called once when the Mini App boots. Refreshes the profile from initData
   * and returns the parsed start_param so the client can route
   * (u_ profile, w_ wishlist, p_ product, s_ group session).
   */
  session: authedProcedure.mutation(async ({ ctx }) => {
    const user = await upsertTelegramUser(ctx.db, ctx.initData.user);
    return {
      user,
      startParam: parseStartParam(ctx.initData.startParam),
      // initData has no chat info when opened from a t.me link in a group.
      chatType: ctx.initData.chatType ?? null,
    };
  }),
});
