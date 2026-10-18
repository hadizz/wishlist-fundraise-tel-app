# Environment variables

Validated at startup by `src/env.ts` (zod). A missing or invalid value stops the process
with a readable error. Both processes read the same set; "Used by" shows which one
actually needs each value. Put secrets in a Kubernetes Secret, and plain config in a ConfigMap.

| Variable | Req. | Default | Used by | Description |
|---|---|---|---|---|
| `NODE_ENV` | | `development` | both | `development` \| `test` \| `production` |
| `LOG_LEVEL` | | `info` | both | `debug` \| `info` \| `warn` \| `error` |
| `DATABASE_URL` | ✅ secret | – | both, migrate | `postgres://user:pass@host:5432/db` (CNPG `-rw` service) |
| `DATABASE_POOL_MAX` | | `10` | both | postgres.js pool size per process |
| `REDIS_URL` | ✅ secret | – | both | `redis://[:pass@]host:6379/0`. API rate limit; checked by the readiness probes. |
| `BOT_TOKEN` | ✅ secret | – | both | From @BotFather. Also the HMAC key for initData validation. |
| `BOT_USERNAME` | ✅ | – | both | Without `@`; used to build `t.me` links |
| `MINI_APP_SHORT_NAME` | | `app` | both | BotFather Mini App short name (`t.me/<bot>/<short>`) |
| `MINI_APP_URL` | ✅ | – | both | Public HTTPS URL of the frontend (Cloudflare Pages) |
| `BOT_MODE` | | `webhook` | bot | `webhook` (prod) \| `polling` (local dev) |
| `WEBHOOK_PUBLIC_URL` | when webhook | – | bot | Public base URL of the bot service, e.g. `https://bot.example.com` |
| `WEBHOOK_SECRET` | when webhook, secret | – | bot | 32–256 chars `[A-Za-z0-9_-]`; checked against `X-Telegram-Bot-Api-Secret-Token` |
| `BOT_PORT` | | `8081` | bot | Webhook + health port |
| `SUPPORT_CHAT_ID` | | – | bot | Chat that receives `/paysupport` requests |
| `API_PORT` | | `8080` | api | tRPC + health port |
| `CORS_ORIGINS` | | empty | api | Comma-separated origins allowed to call the API (the Mini App origin) |
| `INIT_DATA_MAX_AGE_SECONDS` | | `86400` | api | Reject older initData |
| `RATE_LIMIT_PER_MINUTE` | | `120` | api | Per Telegram user |
| `STARS_RATES` | | `USD:1.3` | both | `CUR:minor-units-per-Star`, comma-separated. Also the list of allowed product currencies besides `XTR`. |
| `STARS_MIN` / `STARS_MAX` | | `1` / `10000` | both | Bounds for one Stars contribution |
| `S3_ENDPOINT` | ✅ | – | api | R2: `https://<account>.r2.cloudflarestorage.com`; MinIO URL |
| `S3_REGION` | | `auto` | api | |
| `S3_BUCKET` | ✅ | – | api | Product images |
| `S3_ACCESS_KEY_ID` | ✅ secret | – | api | |
| `S3_SECRET_ACCESS_KEY` | ✅ secret | – | api | |
| `S3_PUBLIC_BASE_URL` | ✅ | – | api | Public read URL for the bucket (CDN) |
| `UPLOAD_MAX_BYTES` | | `5242880` | api | Max image size |
| `OUTBOX_POLL_INTERVAL_MS` | | `1000` | bot | Idle poll interval |
| `OUTBOX_BATCH_SIZE` | | `25` | bot | Rows per claim |
| `OUTBOX_MAX_ATTEMPTS` | | `8` | bot | After this, the row is marked `failed` |

Not needed in v1: there are no scraper variables, because URL scraping was dropped (user decision on MOSA-39).
