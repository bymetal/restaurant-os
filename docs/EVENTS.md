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

`apps/worker` is now a real outbox consumer (previously a heartbeat-only
stub): it polls `outbox_events WHERE published_at IS NULL` with
`FOR UPDATE SKIP LOCKED`, and for `order.status_changed`, `loyalty.stamp_earned`,
and `customer.whatsapp_joined` events, resolves the business's connected
Evolution instance and the customer's phone, then forwards a notification
request to n8n (`N8N_BASE_URL`, shared-secret header). n8n selects a message
template and calls Evolution directly — see `n8n/workflows/whatsapp-notifications.json`.
Events whose dispatch keeps failing are marked published after 10 attempts
(with `last_error` retained) so one poisoned event can't block the queue.

`customer.whatsapp_joined` is emitted by the Evolution webhook handler
(`apps/api/src/repositories/webhooks.ts`) when an inbound `KATIL {token}`
message creates or matches a customer, in the same transaction as the
customer upsert and the `TRANSACTIONAL` consent row.

`order.created` now also carries an enriched payload (branch, fulfillment,
customer name/phone, item lines with modifiers, note, total, payment method)
so `apps/worker` can forward a self-contained notification to Telegram
without an extra query. The worker's `WHATSAPP_EVENT_TYPES` set is unchanged
(`order.status_changed`/`loyalty.stamp_earned`/`customer.whatsapp_joined`);
`order.created` is instead routed to a separate `dispatchTelegram` path that
looks up the business's connected Telegram `chat_id` and forwards to
`n8n/workflows/telegram-notifications.json` — see ADR-010.

Order transitions to `ACCEPTED` also create a `print_jobs` row
(`type = 'KITCHEN_RECEIPT'`) synchronously inside `transitionOrder`, the same
transaction-scoped pattern used for `loyalty.stamp_earned`. This fires
identically whether the transition came from the admin UI or from a Telegram
`callback_query` (`transitionOrderFromTelegram`, an actor with
`actorType: "system"`).

`apps/worker` also runs a printer-health sweep on every tick: any
`print_devices` row whose `last_heartbeat_at` is older than 3 minutes flips
to `offline` and opens a `system_issues` row (`issue_type = 'printer_offline'`),
implementing master plan WF-12. See ADR-010.
