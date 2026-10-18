// Dummy config so src/env.ts validates under `bun test`. No network is used.
Object.assign(process.env, {
  NODE_ENV: "test",
  DATABASE_URL: "postgres://test:test@localhost:5432/test",
  REDIS_URL: "redis://localhost:6379",
  BOT_TOKEN: "123456:TEST_TOKEN_abcdefghijklmnopqrstuvwxyz",
  BOT_USERNAME: "wishlist_test_bot",
  MINI_APP_URL: "https://app.example.com",
  BOT_MODE: "polling",
  STARS_RATES: "USD:1.3,EUR:1.2",
  S3_ENDPOINT: "https://s3.example.com",
  S3_BUCKET: "test",
  S3_ACCESS_KEY_ID: "x",
  S3_SECRET_ACCESS_KEY: "x",
  S3_PUBLIC_BASE_URL: "https://cdn.example.com",
});
