# Events

The initial foundation only persists the `outbox_events` table. The worker and
provider dispatchers will be added in the integration phase.

Events are written in the same transaction as the state change. Delivery must
be retryable and idempotent, and external providers must never be called as a
required step before the transaction commits.
