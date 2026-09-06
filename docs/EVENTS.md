# Events

The initial foundation only persists the `outbox_events` table. The worker and
provider dispatchers will be added in the integration phase.

Events are written in the same transaction as the state change. Delivery must
be retryable and idempotent, and external providers must never be called as a
required step before the transaction commits.

Phase 3 emits `order.created` when checkout commits and
`order.status_changed` for every valid order transition. Each payload contains
the order aggregate ID and is written in the same transaction as the order
mutation.

Loyalty emits `loyalty.stamp_earned` when an order transition to `DELIVERED`
grants a stamp. The payload contains the customer ID, order ID, stamps earned,
and resulting balance, written in the same transaction as the order
transition and the ledger insert.
