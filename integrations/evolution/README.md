# Evolution Adapter

Evolution API is the WhatsApp provider implementation. The adapter itself
lives in `packages/integrations/src/evolution.ts` (`EvolutionClient`),
following the same provider-adapter pattern as `payment.ts` in the same
package.

It was written against Evolution's documented v2 REST contract (instance
create/connect/state, `/webhook/set`, `/message/sendText`) without a live
instance to test against. Before relying on it in production: verify the
deployed provider's actual endpoints, auth header, and the `MESSAGES_UPSERT`
webhook payload shape in staging, and adjust `evolution.ts` if they differ.

Business-facing usage:
- `apps/api/src/repositories/evolution.ts` — connection lifecycle (connect,
  status, disconnect), encrypts the instance API key at rest with
  `@restaurant-os/auth`'s `encryptSecret`/`decryptSecret`.
- `apps/api/src/repositories/webhooks.ts` — inbound webhook ingestion,
  dedupe via `webhook_events`, routes `KATIL`/`SADAKAT` deep-link commands
  and opt-out keywords using `@restaurant-os/domain`'s `consent.ts`.
- `apps/worker` — outbox consumer calls `EvolutionClient.sendText` (via n8n,
  see `n8n/workflows/`) for outbound notifications.
