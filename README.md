# Wishlist & Fundraise — Telegram Mini App backend

Bun + tRPC API, grammY bot, Drizzle ORM on PostgreSQL (CNPG), Redis.
Users keep wishlists, share them with followers, and collect gifts in Telegram Stars
or as manual ("I paid you") contributions, alone or as a group fundraiser in a chat.

## Layout

```
src/
  env.ts                    zod-validated config (docs/env.md)
  db/
    schema.ts               Drizzle schema (docs/database.md)
    client.ts, migrate.ts
    migrations/             generated SQL
  lib/                      init-data HMAC, money/Stars, entitlements (plan limits), redis, S3, t.me links
  services/                 domain logic shared by API and bot
    contributions.ts        every money state transition (Stars, manual, refunds)
    access.ts               wishlist visibility rules
    follows.ts, outbox.ts, users.ts
  api/                      tRPC server (docs/api.md)
    server.ts               Bun.serve: /trpc, /healthz, /readyz
    trpc.ts                 context + initData auth middleware
    routers/                auth, users, wishlists, products, follows, contributions, group-sessions
  bot/                      grammY bot (docs/bot.md)
    index.ts                webhook or polling entrypoint + outbox worker
    bot.ts                  middleware, composers, command menus
    commands/private.ts     DM commands
    commands/group.ts       /fundraise, /status, /contribute, /close
    handlers/               payments (Stars), callbacks, membership, inline
    notifications/worker.ts outbox delivery
    render.ts               message text + keyboards
  test/                     PGlite test DB + env preload
```

Two deployables share one image: `bun src/api/server.ts` and `bun src/bot/index.ts`.
Run migrations first with `bun src/db/migrate.ts` (a k8s Job).

## Develop

```sh
bun install
cp .env.example .env          # fill BOT_TOKEN etc.
bun run db:migrate
bun run dev:api               # :8080
bun run dev:bot               # long polling
bun test                      # PGlite: no external DB needed
bun run typecheck
```

After changing `src/db/schema.ts`, run `bun run db:generate` and commit the new migration.
