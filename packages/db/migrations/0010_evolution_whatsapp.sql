CREATE TABLE integration_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'evolution' CHECK (provider IN ('evolution')),
  instance_name text NOT NULL,
  instance_id text,
  encrypted_api_key text,
  phone text,
  connection_state text NOT NULL DEFAULT 'connecting' CHECK (connection_state IN ('connecting', 'connected', 'disconnected')),
  webhook_state text NOT NULL DEFAULT 'pending' CHECK (webhook_state IN ('pending', 'configured', 'failing')),
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, provider)
);

CREATE TABLE customer_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('TRANSACTIONAL', 'MARKETING', 'LOYALTY')),
  status text NOT NULL CHECK (status IN ('granted', 'withdrawn')),
  source text NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  withdrawn_at timestamptz,
  policy_version text NOT NULL DEFAULT 'v1'
);

CREATE INDEX customer_consents_lookup_idx ON customer_consents (business_id, customer_id, type, captured_at DESC);

CREATE TABLE loyalty_claim_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  token_hash text NOT NULL,
  created_by uuid REFERENCES platform_users(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  consumed_by_customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, token_hash)
);

CREATE INDEX loyalty_claim_tokens_pending_idx ON loyalty_claim_tokens (business_id, expires_at) WHERE consumed_at IS NULL;

CREATE TABLE webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'evolution',
  connection_id uuid REFERENCES integration_connections(id) ON DELETE SET NULL,
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  provider_event_id text,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'ignored', 'failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  error text
);

CREATE UNIQUE INDEX webhook_events_dedupe_idx ON webhook_events (connection_id, provider_event_id) WHERE provider_event_id IS NOT NULL;
CREATE INDEX webhook_events_pending_idx ON webhook_events (received_at) WHERE status = 'pending';

CREATE TABLE qr_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN ('ACQUISITION', 'LOYALTY_STATIC_ENTRY', 'TABLE', 'ORDER', 'CAMPAIGN')),
  source text NOT NULL,
  campaign_id uuid REFERENCES campaigns(id) ON DELETE SET NULL,
  table_number text,
  source_token text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, source_token)
);

CREATE TABLE acquisition_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  qr_code_id uuid REFERENCES qr_codes(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN ('scanned', 'customer_created', 'order_placed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX acquisition_events_qr_idx ON acquisition_events (business_id, qr_code_id, created_at DESC);

INSERT INTO permissions (key) VALUES
  ('business:integration:read'),
  ('business:integration:write'),
  ('business:qr:write')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT roles.id, permissions.id
FROM roles
JOIN permissions ON
  (permissions.key = 'business:integration:read' AND roles.name IN ('OWNER', 'MANAGER', 'ANALYST')) OR
  (permissions.key = 'business:integration:write' AND roles.name IN ('OWNER', 'MANAGER')) OR
  (permissions.key = 'business:qr:write' AND roles.name IN ('OWNER', 'MANAGER', 'CASHIER'))
WHERE roles.scope = 'business'
ON CONFLICT DO NOTHING;
