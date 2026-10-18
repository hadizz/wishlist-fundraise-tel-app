import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { InitDataError, validateInitData } from "./init-data";

const TOKEN = "123456:TEST_TOKEN_abcdefghijklmnopqrstuvwxyz";

function sign(fields: Record<string, string>, token = TOKEN): string {
  const dcs = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  const hash = createHmac("sha256", secret).update(dcs).digest("hex");
  return new URLSearchParams({ ...fields, hash }).toString();
}

const now = Date.UTC(2026, 9, 18, 12, 0, 0);
const fields = {
  auth_date: String(now / 1000 - 60),
  query_id: "AAH",
  user: JSON.stringify({ id: 42, first_name: "Ann", username: "ann" }),
  start_param: "w_0b0f8c38-3e7d-4f8e-9a51-6f0a2f6b9d11",
  signature: "ed25519-sig-is-part-of-the-check-string",
};

describe("validateInitData", () => {
  test("accepts a correctly signed payload", () => {
    const d = validateInitData(sign(fields), TOKEN, 3600, now);
    expect(d.user.id).toBe(42);
    expect(d.startParam).toBe(fields.start_param);
  });
  test("rejects a tampered field", () => {
    const raw = sign(fields).replace("Ann", "Bob");
    expect(() => validateInitData(raw, TOKEN, 3600, now)).toThrow(InitDataError);
  });
  test("rejects another bot's signature", () => {
    expect(() => validateInitData(sign(fields, "999:OTHER"), TOKEN, 3600, now)).toThrow("bad signature");
  });
  test("rejects stale auth_date", () => {
    expect(() => validateInitData(sign(fields), TOKEN, 30, now)).toThrow("expired");
  });
});
