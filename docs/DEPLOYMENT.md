# Deployment

Local infrastructure is defined in `docker-compose.yml` and currently contains
PostgreSQL and Redis. Public application, API, webhook, and provider endpoints
must use HTTPS in deployed environments. Keep staging databases, Redis,
Evolution instances, n8n environments, and test chats separate from
production.

The deployment command surface is intentionally defined by the root scripts and
must be kept in sync with this document as the workspace grows.

Coolify uses `docker-compose.coolify.yml` from the private Git repository. The
API container applies ordered migrations before starting. `api`, `admin`,
`storefront`, and (once its domain/basic-auth are configured) `n8n` each
receive their own public domain via Coolify's per-service `docker_compose_domains`
setting; PostgreSQL, Redis, and n8n's data volume are internal services with
persistent volumes. `admin`/`storefront` need `NEXT_PUBLIC_API_URL` set as a
**build-time** Coolify environment variable (Next.js inlines it into the
client bundle, so it must be correct before `pnpm build` runs, not just at
container start).

`EVOLUTION_BASE_URL`/`EVOLUTION_GLOBAL_API_KEY` and `N8N_BASE_URL`/
`N8N_INBOUND_SECRET` must be set to real values before WhatsApp connections
or outbound notifications work — see ADR-009. Until a real Evolution/n8n
deployment exists, these default to local placeholders and
`POST /v1/integrations/whatsapp/connect` will fail.

`TELEGRAM_BOT_TOKEN` must be a real bot token (created via @BotFather) before
`POST /v1/integrations/telegram/connect` can do anything useful — see
ADR-010. Unlike the Evolution/n8n secrets above, `TELEGRAM_BOT_TOKEN` is
deliberately **not** part of `packages/config/src/env.ts`'s production
secret-crash guard, so a missing/placeholder value does not block API
startup; it only causes Telegram API calls to fail at request time.
`TELEGRAM_WEBHOOK_SECRET` (validated against Telegram's
`X-Telegram-Bot-Api-Secret-Token` header) **is** in that guard and must have
a real generated value in Coolify before deploying, same as
`N8N_INBOUND_SECRET`.

`apps/print-agent` is **not** part of `docker-compose.coolify.yml` — per
master plan section 31 it runs on the restaurant's own PC/mini-PC/Raspberry
Pi, not in the cloud. It only needs network access to the public API domain
and a per-device key issued via the admin panel's Printers page
(`POST /v1/printers/devices`); see ADR-010.
