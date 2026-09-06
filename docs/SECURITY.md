# Security

- Derive tenant scope on the server; never trust client-supplied
  `business_id` or `branch_id`.
- Validate API input at the boundary with Zod and keep `/v1` contracts and
  stable error codes current as modules are added.
- Access JWTs use fixed HS256, issuer, audience, short expiry, and a database
  token-version check. Refresh tokens are opaque, hashed, rotated by family,
  and revoked on reuse.
- Passwords use Argon2id; login failures are counted and temporarily locked
  after repeated failures. Login errors do not reveal whether an email exists.
- Keep real secrets in environment/secret storage. `.env.example` contains
  placeholders only. Do not write secrets or customer PII to repository docs
  or agent memory.
- Encrypt integration credentials at rest once provider connections are added.
- Audit role changes, impersonation, loyalty adjustments/redemptions,
  cancellations/refunds, secret changes, subscriptions, and PII exports.
- Add tenant-isolation, idempotency, authorization, and token-expiry tests with
  each relevant feature.
- Public menu and cart routes are rate-limited through Redis. Cart sessions are
  scoped by both session hash and resolved business; a public URL never accepts
  a client-supplied tenant ID.
- Cart item prices are server-derived and stored as snapshots. Client-provided
  prices are ignored, inactive products are rejected, and modifier min/max
  rules are enforced in Core API code.
