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
