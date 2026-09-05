# Security

- Derive tenant scope on the server; never trust client-supplied
  `business_id` or `branch_id`.
- Validate API input at the boundary with Zod and keep `/v1` contracts and
  stable error codes current as modules are added.
- Keep real secrets in environment/secret storage. `.env.example` contains
  placeholders only. Do not write secrets or customer PII to repository docs
  or agent memory.
- Encrypt integration credentials at rest once provider connections are added.
- Audit role changes, impersonation, loyalty adjustments/redemptions,
  cancellations/refunds, secret changes, subscriptions, and PII exports.
- Add tenant-isolation, idempotency, authorization, and token-expiry tests with
  each relevant feature.
