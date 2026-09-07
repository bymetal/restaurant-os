ALTER TABLE integration_connections DROP CONSTRAINT integration_connections_provider_check;
ALTER TABLE integration_connections ADD CONSTRAINT integration_connections_provider_check CHECK (provider IN ('evolution', 'telegram'));
ALTER TABLE integration_connections ADD COLUMN chat_id text;
ALTER TABLE integration_connections ADD COLUMN link_code text;
ALTER TABLE integration_connections ADD COLUMN link_code_expires_at timestamptz;

CREATE UNIQUE INDEX integration_connections_link_code_idx ON integration_connections (link_code) WHERE link_code IS NOT NULL;

ALTER TABLE integration_health DROP CONSTRAINT integration_health_integration_type_check;
ALTER TABLE integration_health ADD CONSTRAINT integration_health_integration_type_check CHECK (integration_type IN ('whatsapp', 'telegram', 'printer', 'webhook', 'payment'));

CREATE TABLE print_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  name text NOT NULL,
  role text NOT NULL DEFAULT 'KITCHEN' CHECK (role IN ('KITCHEN', 'CASHIER')),
  device_key_hash text NOT NULL,
  status text NOT NULL DEFAULT 'offline' CHECK (status IN ('online', 'offline')),
  last_heartbeat_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, name)
);

CREATE TABLE print_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  device_id uuid REFERENCES print_devices(id) ON DELETE SET NULL,
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN ('KITCHEN_RECEIPT', 'CASHIER_RECEIPT', 'PIZZA_BOX_LABEL', 'DELIVERY_LABEL')),
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENT', 'PRINTED', 'FAILED', 'CANCELLED')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  printed_at timestamptz
);

CREATE INDEX print_jobs_pending_idx ON print_jobs (business_id, branch_id, created_at) WHERE status = 'PENDING';
CREATE INDEX print_jobs_order_idx ON print_jobs (order_id);

INSERT INTO permissions (key) VALUES
  ('business:printer:read'),
  ('business:printer:write')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT roles.id, permissions.id
FROM roles
JOIN permissions ON
  (permissions.key = 'business:printer:read' AND roles.name IN ('OWNER', 'MANAGER', 'CASHIER', 'KITCHEN')) OR
  (permissions.key = 'business:printer:write' AND roles.name IN ('OWNER', 'MANAGER'))
WHERE roles.scope = 'business'
ON CONFLICT DO NOTHING;
