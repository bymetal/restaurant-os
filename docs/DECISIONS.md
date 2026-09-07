# Architecture Decisions

## ADR-001 - Phase 0 Foundation

- Date: 2026-09-06
- Status: Accepted

### Context

The repository started as a product and architecture plan without executable
code. The first implementation needs a small foundation that keeps tenant
isolation, deterministic business logic, and durable side effects possible.

### Decision

Use a pnpm workspace with strict TypeScript, Fastify for the Core API,
PostgreSQL for durable state, Redis for transient infrastructure, Zod for
runtime boundary validation, and ordered SQL migrations. Keep provider
integrations behind adapter boundaries. The initial database foundation includes
business/branch membership, outbox events, idempotency keys, and audit logs.

The ORM choice remains open until the data-access layer is implemented. No
runtime AI or n8n business logic is introduced.

### Consequences

Phase 0 can be verified locally with Docker Compose and does not hide missing
provider credentials behind fake production claims. Later schema changes must be
new migrations, and architecture changes require another ADR.

## ADR-002 - Phase 1 Authentication

- Date: 2026-09-06
- Status: Accepted

### Context

Restaurant users need revocable sessions and platform/business role contexts
without trusting role claims or tenant IDs supplied by a client.

### Decision

Use short-lived HS256 access JWTs with fixed issuer/audience and a token version
checked against PostgreSQL on every authenticated request. Use opaque,
SHA-256-hashed refresh tokens with family rotation and reuse revocation. Store
passwords with Argon2id and keep the password hash, token version, role, and
permissions in the database. Refresh tokens are HttpOnly, Secure in production,
SameSite=Strict cookies.

### Consequences

Role changes, password changes, and tenant suspension can revoke active access
through a token-version bump. The database remains the source of truth for
authorization, while access tokens remain short-lived identity assertions.

## ADR-003 - Phase 2 Menu Pricing

- Date: 2026-09-06
- Status: Accepted

### Context

Menu and cart prices must remain deterministic when they later become order
prices. Database numeric rounding would add avoidable ambiguity for TRY and
other currencies.

### Decision

Store product base prices, variant adjustments, modifier adjustments, and cart
snapshots as integer minor units. Treat a missing branch availability override
as available when the product itself is active. Defer the explicit `menus`
container and upsell rule builder until their planned phases; Phase 2 uses one
implicit menu tree per business.

### Consequences

Cart totals can be calculated without floating-point arithmetic, and Phase 3
order snapshots can reuse the same price primitives. A later menu container can
be introduced through a migration without changing product ownership rules.

## ADR-004 - Phase 3 Order and Payment Boundaries

- Date: 2026-09-06
- Status: Accepted

### Context

Checkout must remain correct when menu prices or availability change after a
cart is created, and the same client request may be retried.

### Decision

Checkout locks the active cart, revalidates every product, variant, modifier,
branch, and availability rule from PostgreSQL, and recomputes totals in integer
minor units. It writes order snapshots, customer/address snapshots, an offline
payment, the initial order event, cart closure, and `order.created` outbox event
in one transaction. `Idempotency-Key` is mandatory for checkout and is scoped to
the resolved business with a 24-hour expiry.

Phase 3 supports cash, card-on-delivery, and pay-at-restaurant only. The payment
adapter boundary is present, but no online provider or external payment call is
made. Restaurant order state transitions remain Core API mutations and are
restricted by role.

### Consequences

Retries return the stored order even after the original cart is closed, client
totals and payment amounts cannot alter the server result, and external side
effects can be added later through the outbox without blocking checkout.

## ADR-005 - Loyalty Ledger And Synchronous Stamp Earning

- Date: 2026-09-06
- Status: Accepted

### Context

Restaurant OS needs a per-business stamp/reward loyalty program (one active
program per business). AGENTS.md requires loyalty changes to be stored in a
transaction ledger, claim tokens consumed atomically and once, and balances
derived from ledger activity.

### Decision

Store loyalty state in three tables: `loyalty_programs` (rules), `loyalty_accounts`
(materialized balance, one per customer per program), and `loyalty_transactions`
(the ledger; every EARN, ADJUSTMENT_ADD, ADJUSTMENT_REMOVE, and REDEEM is a row).
A partial unique index on `loyalty_transactions (business_id, idempotency_key)`
is the claim mechanism: an idempotent write attempts `INSERT ... ON CONFLICT DO
NOTHING RETURNING id` inside the same transaction that updates the account
balance, so a conflicting insert and the balance mutation always succeed or
fail together. No separate claim-token table is introduced. Every mutating
function additionally checks for an existing ledger row for the same
idempotency key **before** evaluating business rules (insufficient balance,
reward availability), so a retried request that arrives after the original
already changed the balance is replayed rather than incorrectly rejected.

A customer automatically earns a stamp when their order transitions to
`DELIVERED`. `grantOrderStamp` runs inside `transitionOrder`'s existing
transaction (no new outbox consumer or worker process), the same pattern
`checkoutOrder` already uses for calling the offline payment adapter
synchronously. The order state machine already prevents re-entering
`DELIVERED`, so double-earning from a single order is structurally impossible;
the ledger's idempotency key (`order-delivered:{orderId}`) is defense in depth.

### Consequences

Loyalty balances can be audited and reconstructed entirely from
`loyalty_transactions`. Manual point adjustments and redemptions require an
`Idempotency-Key` header and are audited like other sensitive mutations. When a
later phase introduces a general outbox consumer/worker, the synchronous stamp
grant inside `transitionOrder` can be revisited, but is correct and simple for
the current architecture.

## ADR-006 - CRM Data Model And Union-Based Timeline

- Date: 2026-09-06
- Status: Accepted

### Context

The restaurant admin needs a per-customer profile page (segment, notes,
preferences, favorite products, and an interaction timeline) without
duplicating data that already exists in `order_events` and
`loyalty_transactions`.

### Decision

Extend `customers` with `segment`, `acquisition_source`,
`preferred_branch_id`, `preferred_fulfillment`, `birthday`, and
`last_seen_at`. Add `customer_notes` (free-text, audited) and `customer_tags`
(short labels, unique per customer). No separate `customer_events` table is
introduced: the interaction timeline is assembled with a single SQL
`UNION ALL` across `order_events`, `loyalty_transactions`, and
`customer_notes`, ordered by `created_at`. Favorite products are computed with
a `GROUP BY` aggregate over `order_items`/`orders`, not stored redundantly.
Trend percentages on the customer metric cards (total spend, order count,
average basket) compare the last 30 days against the preceding 30 days,
computed from `orders` directly; nothing is fabricated.

### Consequences

Adding a new timeline-worthy event type (for example "campaign clicked" in a
later phase) means adding one more branch to the `UNION ALL`, not a migration
to backfill a duplicate events table. Customer profile updates and notes are
wrapped in the same transaction as their audit log entry, matching every other
mutation in this codebase.

## ADR-007 - Campaigns And Coupon-Code Checkout Discounts

- Date: 2026-09-06
- Status: Accepted

### Context

Restaurant owners need percentage/fixed-amount coupon campaigns with an
optional redemption limit, and the storefront checkout must apply them
correctly under concurrent requests without ever exceeding the configured
limit.

### Decision

`campaigns` follows the same explicit state machine pattern as orders
(`draft → scheduled/active → paused/completed`, terminal `archived`/`completed`),
implemented in `packages/domain/src/campaign.ts`. Checkout resolves a supplied
`couponCode` with `resolveCampaignDiscount`, which locks the campaign row with
`SELECT ... FOR UPDATE` **inside the same transaction as the rest of
checkout**, validates status/date bounds/minimum order amount/redemption
limit, computes the discount, and increments `redemption_count` before the
order is written. If the coupon is invalid, expired, or exhausted, the entire
checkout transaction rolls back with a specific error code
(`CAMPAIGN_NOT_FOUND` / `CAMPAIGN_NOT_ACTIVE` / `CAMPAIGN_EXPIRED` /
`CAMPAIGN_MINIMUM_NOT_REACHED` / `CAMPAIGN_LIMIT_REACHED`) rather than silently
placing the order without the discount — a customer who supplied a coupon
code should see a clear failure, not a surprise price. The discount is
recorded as an `order_adjustments` row (`type = 'campaign_discount'`,
`campaign_id` set), reusing the existing table instead of a new one.

### Consequences

The `FOR UPDATE` lock on the campaign row serializes concurrent checkouts
racing for the last redemption slot; exactly one succeeds, and the loser's
whole order is rolled back (not partially applied). Campaign performance
(`GET /v1/campaigns/:id/performance`) is computed directly from
`order_adjustments` joined to `orders`, so it can never drift from what
customers actually paid.

## ADR-008 - Platform Analytics, Billing Bookkeeping, And Integration Health Placeholders

- Date: 2026-09-06
- Status: Accepted

### Context

The super-admin dashboard mockup shows platform-wide metrics including MRR,
connected WhatsApp count, and open system issues. No payment provider
(Stripe/İyzico) or Evolution/WhatsApp integration exists yet, and building
either is a separate, much larger phase requiring external provider
credentials that are not available in this environment.

### Decision

`billing_plans` (seeded with Starter/Growth/Pro at the exact prices shown on
the landing page) and `business_subscriptions` record **which plan a
business is on**, not a real payment/billing system. MRR is
`SUM(monthly_price_minor) WHERE status IN ('active','trialing')` — real
bookkeeping arithmetic, not a charge. `integration_health` and
`system_issues` are real, queryable tables with correct schemas, but they
start and remain **empty** until a future Evolution adapter, printer agent, or
n8n webhook handler actually writes to them. The platform overview endpoint
never fabricates a number for these: a business with no `integration_health`
row is reported as `disconnected`, and zero rows in `system_issues` means the
dashboard genuinely shows zero open issues, not a fake "all healthy" default.
Every count-based platform metric (`totalBusinesses`, `totalCustomers`) gets
a real 30-day-window growth trend computed from `created_at`; metrics with no
historical basis (MRR, connected WhatsApp count) report no trend rather than
an invented one.

### Consequences

When the Evolution/WhatsApp and printer-agent phases are eventually built,
they only need to write rows into `integration_health`/`system_issues` — the
super-admin dashboard already reads and displays them correctly, no schema
migration required. Anyone auditing the super-admin dashboard's numbers can
trace every figure back to a real row in the database; nothing is a
placeholder constant.

## ADR-009 - Evolution/WhatsApp Integration, QR Acquisition, And Outbox-Driven Notifications

- Date: 2026-09-06
- Status: Accepted

### Context

ADR-008 deliberately left `integration_health`/`system_issues` empty because
no WhatsApp provider was wired up. The master plan names Evolution API (a
self-hosted, Baileys-based WhatsApp gateway, not Meta's official Cloud API)
as the committed provider. A comparable official-API alternative (Zernio)
was researched and presented, but the user chose to stay with the original
Evolution API decision rather than switch providers. No live Evolution
instance or n8n instance exists in this environment, so this phase is coded
against Evolution's documented v2 REST/webhook contract and must be verified
against a real deployment before going live (consistent with AGENTS.md's
"verify the deployed provider's endpoints... in staging" instruction).

### Decision

- **Adapter boundary**: `packages/integrations/src/evolution.ts` (`EvolutionClient`)
  mirrors the existing `payment.ts` adapter pattern — a thin typed HTTP
  client, no business logic. `apps/api/src/repositories/evolution.ts` owns
  the connection lifecycle (connect/status/disconnect) against
  `integration_connections`, encrypting the instance credential at rest with
  a new `packages/auth/src/encryption.ts` (AES-256-GCM, keyed by
  `APP_ENCRYPTION_KEY`) rather than storing it in plaintext.
- **Webhook ingestion**: `POST /v1/webhooks/evolution/:connectionId` is
  public but rate-limited; `apps/api/src/repositories/webhooks.ts` dedupes
  by `(connection_id, provider_event_id)` in `webhook_events` before doing
  any work, matching the idempotent-webhook requirement in AGENTS.md. Inbound
  text is parsed by `@restaurant-os/domain`'s `parseInboundCommand`
  (`KATIL {token}` acquisition, `SADAKAT {token}` loyalty claim) and
  `isOptOutMessage` (STOP/IPTAL/"mesaj istemiyorum"), keeping the WhatsApp
  wire-format parsing in one small, unit-tested place.
- **Loyalty claim tokens**: `loyalty_claim_tokens` is deliberately a
  separate table from the existing `loyalty_transactions` idempotency-key
  mechanism (ADR-005), because claim tokens are pre-issued (staff generates
  a QR before the customer ever messages) and must be consumed atomically
  by a single `UPDATE ... WHERE consumed_at IS NULL RETURNING id` — the
  exact race-condition-proof pattern the master plan specifies. A second
  consumption attempt returns the master plan's own example error code,
  `LOYALTY_TOKEN_ALREADY_USED`.
- **Consent is not inferred from messaging**: sending `KATIL` grants only
  `TRANSACTIONAL` consent; `MARKETING` consent is a separate row an opt-out
  can withdraw but never silently re-grant (a new legitimate opt-in event is
  required), per master plan §13.
- **Outbound messaging goes through the outbox, not synchronously from the
  webhook handler or from order/loyalty repositories.** `apps/worker`
  (previously a heartbeat-only stub) now polls `outbox_events` with
  `FOR UPDATE SKIP LOCKED`, resolves the connected instance + customer
  phone, and forwards notifiable events (`order.status_changed`,
  `loyalty.stamp_earned`, `customer.whatsapp_joined`) to n8n over HTTP with
  a shared-secret header; n8n picks a message template and calls Evolution's
  `sendText` directly. A poisoned event that fails past `MAX_ATTEMPTS` (10)
  is marked published anyway so it can't block the queue forever, with its
  `last_error` retained for debugging.
- **n8n is new infrastructure, added but not yet live**: `docker-compose.coolify.yml`
  gained an `n8n` service (own volume, meant to get its own subdomain and
  basic-auth like `admin`/`storefront` did). `n8n/workflows/whatsapp-notifications.json`
  is a hand-authored workflow export (webhook → secret check → template →
  Evolution HTTP call) — per master plan §81, the intended long-term
  practice is to build/edit workflows in n8n's own UI and re-export, not
  hand-edit JSON, so this file is a starting point to import and verify
  against a real n8n version.

### Consequences

WhatsApp acquisition, loyalty claims, and outbound order/loyalty
notifications are fully coded and covered by `tests/integration/evolution.test.ts`
(cross-tenant isolation, webhook dedupe, claim-token reuse rejection, opt-out
handling), but three things remain before any of this is truly live: (1) a
real Evolution instance must exist and its actual endpoint/webhook payload
shapes verified against `evolution.ts`'s assumptions, (2) n8n needs a domain,
basic auth, and the workflow imported/activated, (3) `EVOLUTION_BASE_URL`/
`EVOLUTION_GLOBAL_API_KEY`/`N8N_BASE_URL`/`N8N_INBOUND_SECRET` need real
values in Coolify (they currently default to local placeholders). Until
then, `POST /v1/integrations/whatsapp/connect` will fail against a
nonexistent Evolution server — this is the same "real schema, not yet
connected to a live provider" posture ADR-008 established for billing and
integration health.

## ADR-010 - Telegram Operation Channel And Printer Agent

- Date: 2026-09-07
- Status: Accepted

### Context

Master plan section 30 (Telegram Operation Channel) and section 31 (Printer
Agent) were the last unbuilt pieces of the "outbox + n8n/Telegram/printer"
delivery phase from AGENTS.md — ADR-009 covered Evolution/WhatsApp and n8n
infrastructure but not these two channels. Unlike Evolution (self-hosted,
semi-documented), the Telegram Bot API is official and stable, so this phase
leans on it directly where that simplifies the design. No live Telegram bot
or physical ESC/POS printer exists in this environment, so both adapters are
coded against their documented contracts and flagged for staging
verification, matching the posture ADR-009 established for Evolution.

### Decision

- **Single shared platform bot, not one bot per restaurant.** `TELEGRAM_BOT_TOKEN`
  is one global credential (mirroring `EVOLUTION_GLOBAL_API_KEY`'s "one
  gateway, many tenant instances" shape); a business is distinguished by the
  `chat_id` of the group it added the bot to, captured via a `/link {code}`
  flow: `POST /v1/integrations/telegram/connect` generates a 6-digit
  `link_code` (stored on `integration_connections`, 15-minute TTL, unique
  while pending), the owner posts `/link {code}` in their Telegram group, and
  `POST /v1/webhooks/telegram` (a single global webhook, not one per
  connection like Evolution's) resolves the code and records the `chat_id`.
  This reuses the acquisition-by-text-command pattern from ADR-009 instead of
  inventing a new one.
- **Notification content is built in n8n, state mutation stays in Core API.**
  `apps/worker` dispatches `order.created` events to a new
  `n8n/workflows/telegram-notifications.json` workflow (same shape as
  ADR-009's WhatsApp workflow — outbox → secret check → template → provider
  call), which formats the master plan's "🔴 YENİ SİPARİŞ" template and
  attaches inline-keyboard buttons whose `callback_data` encodes
  `ord:{orderId}:{toStatus}`. But **button presses are not routed through
  n8n**: Telegram delivers `callback_query` updates straight to
  `POST /v1/webhooks/telegram`, which resolves the connection by `chat_id`
  and calls `transitionOrder` directly — satisfying master plan section 30's
  explicit requirement that "Telegram callback doğrudan Core API'ye signed
  endpoint üzerinden gitmelidir" and that state mutation never lives in n8n.
- **System actor for order transitions.** `transitionOrder`'s `Actor` type
  gained an optional `actorType: "user" | "system"` and a nullable `userId`;
  Telegram-triggered transitions (`transitionOrderFromTelegram`) skip the
  role check (`roleCanTransition`) since Telegram has no per-person role
  mapping — the group chat itself is the access boundary, same trust level
  as the OWNER/MANAGER who linked it. `order_events.actor_type` already had
  a `'system'` value in its CHECK constraint from ADR-004, so no schema
  change was needed there.
- **Kitchen print jobs are created synchronously inside `transitionOrder`**,
  not by a separate consumer, the same "same transaction as the state
  change" pattern ADR-005 used for stamp-earning: when an order moves to
  `ACCEPTED` (whether via the admin UI or a Telegram button), `orders.ts`
  calls `createKitchenPrintJob` with the already-assembled `OrderResponse`,
  writing one `print_jobs` row (`type = 'KITCHEN_RECEIPT'`).
- **Print jobs are claimed by role, not pre-assigned to a device.**
  `print_devices.role` (`KITCHEN`/`CASHIER`) determines which job `type` a
  device's `GET /v1/printers/jobs/pending` can claim
  (`printJobTypeForDeviceRole` in `packages/domain`); the claim query is
  `FOR UPDATE SKIP LOCKED` scoped to the device's own `business_id`/`branch_id`,
  the same job-queue pattern `apps/worker`'s outbox consumer already uses.
  Only `KITCHEN_RECEIPT` is actually produced today — `CASHIER_RECEIPT`/
  `PIZZA_BOX_LABEL`/`DELIVERY_LABEL` exist in the schema and domain enum for
  forward compatibility but have no trigger yet, avoiding building untested
  speculative flows.
- **Device authentication is a separate, simpler scheme from JWT.** A
  print-agent isn't a logged-in user; `POST /v1/printers/devices` (JWT,
  `business:printer:write`, OWNER/MANAGER only) returns a random per-device
  key **once** (same one-time-reveal UX as the Coolify token in this
  project's own credential handling), storing only its SHA-256 hash — the
  same hash-not-encrypt choice ADR-009 made for loyalty claim tokens, since
  the plaintext never needs to be recovered, only verified.
- **`apps/print-agent` is a new, dependency-light app** that runs on the
  restaurant's own PC/mini-PC/Raspberry Pi per master plan section 31, not in
  Coolify's cloud compose file — it authenticates with its device key,
  polls `/v1/printers/heartbeat` and `/v1/printers/jobs/pending`, and acks
  via `/v1/printers/jobs/:id/ack`. Its `PrinterDriver` is a `ConsolePrinterDriver`
  that renders the ticket to stdout instead of real ESC/POS output — no
  physical thermal printer was available to build and test a real driver
  against, so the interface is the deliberate seam for that later work,
  the same "real integration boundary, mocked hardware" choice ADR-009 made
  for QR/WhatsApp acquisition infrastructure before Evolution existed.
- **Printer offline detection lives in `apps/worker`**, alongside the
  existing outbox polling: every 5-second tick, any `print_devices` row
  whose `last_heartbeat_at` is older than 3 minutes flips to `offline` and
  opens a `system_issues` row (`issue_type = 'printer_offline'`, one open
  issue per device via a `metadata->>'deviceId'` guard so multiple printers
  per branch don't collide) — implementing master plan WF-12 (Printer
  Alert) using the `integration_health`/`system_issues` tables ADR-008
  already built for exactly this purpose.
- **`TELEGRAM_BOT_TOKEN` is deliberately excluded from the production
  secret-crash guard** in `packages/config/src/env.ts`, unlike
  `EVOLUTION_GLOBAL_API_KEY`/`N8N_INBOUND_SECRET`. This is a direct lesson
  from the Faz L deployment outage (see `vault/restorant-loyal/deployment.md`):
  requiring a real value for a credential nobody has yet would either block
  every future deploy or repeat that outage. `TELEGRAM_WEBHOOK_SECRET` (a
  purely internal, generatable-in-advance secret) stays in the guard and was
  given a real value in Coolify before this feature's first deploy.

### Consequences

Telegram order notifications/button-driven status changes and kitchen print
jobs are fully coded and covered by `tests/integration/telegram.test.ts` and
`tests/integration/printers.test.ts` (cross-tenant isolation, role-scoped job
routing, webhook dedupe, link-code confirmation, callback-driven transitions),
but nothing here is verified against a live Telegram bot or physical printer:
(1) a real Telegram bot must be created via @BotFather and `TELEGRAM_BOT_TOKEN`
set in Coolify before `/v1/integrations/telegram/connect` can do anything
useful, (2) `n8n/workflows/telegram-notifications.json` needs the same
import-and-activate treatment as the WhatsApp workflow once n8n is live,
(3) `apps/print-agent` needs a real ESC/POS driver implementation before any
restaurant can use it for actual printing — today it only proves the
heartbeat/poll/claim/ack protocol end-to-end.
