# n8n Workflows

n8n orchestrates outbound WhatsApp notifications; it must not own order
totals, discounts, loyalty, rewards, payments, authorization, tenant
isolation, stock state, or final order creation. Those stay in Core API
(`apps/api`), which only forwards already-decided events through the
outbox worker (`apps/worker`).

## whatsapp-notifications.json

Implements WF-01 (Welcome), WF-03 (Order Status), and WF-05 (Reward Earned)
from `RESTAURANT_OS_MASTER_PLAN.md` as a single workflow:

1. **Outbox Webhook** — receives `POST /webhook/restaurant-os-notify` from
   `apps/worker`'s outbox consumer (see `apps/worker/src/index.ts`), body:
   `{ eventType, instanceName, phone, payload }`.
2. **Verify Inbound Secret** — rejects requests whose `x-inbound-secret`
   header doesn't match the `N8N_INBOUND_SECRET` env var (shared with the
   API/worker containers via `docker-compose.coolify.yml`).
3. **Build Message Text** — a Code node that picks a Turkish message
   template based on `eventType`/`payload.toStatus`.
4. **Send WhatsApp Text** — calls Evolution's `POST /message/sendText/:instance`
   directly using the platform's `EVOLUTION_BASE_URL`/`EVOLUTION_GLOBAL_API_KEY`
   env vars (no separate n8n credential needed for v1).

**This JSON was hand-authored against n8n's documented workflow export
schema, without a live n8n instance to import and test it against.**
Before relying on it:

1. Deploy the `n8n` service (already added to `docker-compose.coolify.yml`)
   and give it its own domain (see `vault/restorant-loyal/deployment.md`
   for the pattern used for `admin`/`storefront`).
2. Import this file via n8n's UI (Workflows → Import from File) or the
   n8n CLI, fix any node-parameter mismatches n8n's import flags (node
   type versions drift between n8n releases), then activate it.
3. Set `N8N_BASIC_AUTH_ACTIVE=true` plus `N8N_BASIC_AUTH_USER`/
   `N8N_BASIC_AUTH_PASSWORD` in Coolify so the editor UI isn't public
   (master plan §60: "n8n ve Evolution admin UI ... auth arkasında
   korunmalıdır").
4. Re-export and commit the workflow here after any manual edits, per
   master plan §81 (dev in n8n's UI, version-control the export, import
   into production — never hand-edit workflows directly in prod).

## Known gap

Outbound messages are only dispatched once a business's WhatsApp
connection is `connected` (`apps/worker` checks `integration_connections`
before calling this webhook) — see `packages/integrations/src/evolution.ts`
and `integrations/evolution/README.md` for the connection lifecycle, which
also needs staging verification against a real Evolution instance.
