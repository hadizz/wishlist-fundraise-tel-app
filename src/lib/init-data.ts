import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Validates Telegram Mini App initData per
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 *   secret = HMAC_SHA256(key = "WebAppData", msg = BOT_TOKEN)
 *   hash   = hex(HMAC_SHA256(key = secret, msg = data_check_string))
 *
 * data_check_string = every field except `hash`, sorted by key, "k=v" joined by "\n".
 */
export interface InitDataUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
  allows_write_to_pm?: boolean;
}

export interface InitData {
  user: InitDataUser;
  authDate: Date;
  queryId?: string;
  startParam?: string;
  chatType?: string;
  chatInstance?: string;
}

export class InitDataError extends Error {}

export function validateInitData(raw: string, botToken: string, maxAgeSeconds: number, now = Date.now()): InitData {
  const params = new URLSearchParams(raw);
  const hash = params.get("hash");
  if (!hash || !/^[0-9a-f]{64}$/.test(hash)) throw new InitDataError("missing hash");
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = createHmac("sha256", secret).update(dataCheckString).digest();
  if (!timingSafeEqual(expected, Buffer.from(hash, "hex"))) throw new InitDataError("bad signature");

  const authDate = Number(params.get("auth_date"));
  if (!Number.isInteger(authDate)) throw new InitDataError("missing auth_date");
  if (now / 1000 - authDate > maxAgeSeconds) throw new InitDataError("initData expired");

  const userRaw = params.get("user");
  if (!userRaw) throw new InitDataError("missing user");
  const user = JSON.parse(userRaw) as InitDataUser;
  if (typeof user.id !== "number" || typeof user.first_name !== "string") {
    throw new InitDataError("malformed user");
  }

  return {
    user,
    authDate: new Date(authDate * 1000),
    queryId: params.get("query_id") ?? undefined,
    startParam: params.get("start_param") ?? undefined,
    chatType: params.get("chat_type") ?? undefined,
    chatInstance: params.get("chat_instance") ?? undefined,
  };
}
