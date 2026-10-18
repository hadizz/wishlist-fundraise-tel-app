import { z } from "zod";

/**
 * Single source of truth for runtime configuration. Both processes (api, bot)
 * import this; each var is documented in docs/env.md.
 */
const bool = z
  .enum(["true", "false", "1", "0"])
  .transform((v) => v === "true" || v === "1");

/** "USD:1.3,EUR:1.2" -> { USD: 1.3, EUR: 1.2 } (minor units of currency per 1 Star). */
const starsRates = z.string().transform((raw, ctx) => {
  const out: Record<string, number> = {};
  for (const pair of raw.split(",").map((s) => s.trim()).filter(Boolean)) {
    const [cur, rate] = pair.split(":");
    const n = Number(rate);
    if (!cur || !/^[A-Z]{3}$/.test(cur) || !Number.isFinite(n) || n <= 0) {
      ctx.addIssue({ code: "custom", message: `invalid STARS_RATES entry "${pair}"` });
      return z.NEVER;
    }
    out[cur] = n;
  }
  return out;
});

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

    DATABASE_URL: z.url(),
    DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
    REDIS_URL: z.url(),

    BOT_TOKEN: z.string().regex(/^\d+:[\w-]{30,}$/, "BOT_TOKEN must look like 123456:ABC..."),
    BOT_USERNAME: z.string().regex(/^\w{5,32}$/),
    MINI_APP_SHORT_NAME: z.string().min(1).default("app"),
    MINI_APP_URL: z.url(),
    BOT_MODE: z.enum(["webhook", "polling"]).default("webhook"),
    WEBHOOK_PUBLIC_URL: z.url().optional(),
    WEBHOOK_SECRET: z.string().regex(/^[A-Za-z0-9_-]{32,256}$/).optional(),
    BOT_PORT: z.coerce.number().int().default(8081),
    SUPPORT_CHAT_ID: z.coerce.number().int().optional(),

    API_PORT: z.coerce.number().int().default(8080),
    CORS_ORIGINS: z
      .string()
      .default("")
      .transform((s) => s.split(",").map((x) => x.trim()).filter(Boolean)),
    INIT_DATA_MAX_AGE_SECONDS: z.coerce.number().int().positive().default(86_400),
    RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(120),

    STARS_RATES: starsRates.default({ USD: 1.3 } as never),
    STARS_MIN: z.coerce.number().int().min(1).default(1),
    STARS_MAX: z.coerce.number().int().max(100_000).default(10_000),

    S3_ENDPOINT: z.url(),
    S3_REGION: z.string().default("auto"),
    S3_BUCKET: z.string().min(1),
    S3_ACCESS_KEY_ID: z.string().min(1),
    S3_SECRET_ACCESS_KEY: z.string().min(1),
    S3_PUBLIC_BASE_URL: z.url(),
    UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(5 * 1024 * 1024),

    OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(1_000),
    OUTBOX_BATCH_SIZE: z.coerce.number().int().positive().default(25),
    OUTBOX_MAX_ATTEMPTS: z.coerce.number().int().positive().default(8),
  })
  .superRefine((e, ctx) => {
    if (e.BOT_MODE === "webhook" && (!e.WEBHOOK_PUBLIC_URL || !e.WEBHOOK_SECRET)) {
      ctx.addIssue({
        code: "custom",
        path: ["WEBHOOK_PUBLIC_URL"],
        message: "WEBHOOK_PUBLIC_URL and WEBHOOK_SECRET are required when BOT_MODE=webhook",
      });
    }
  });

export type Env = z.infer<typeof schema>;

function load(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid environment:\n" + z.prettifyError(parsed.error));
    process.exit(1);
  }
  return parsed.data;
}

export const env = load();
