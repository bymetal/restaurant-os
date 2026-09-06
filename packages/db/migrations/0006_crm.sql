ALTER TABLE customers
  ADD COLUMN segment text NOT NULL DEFAULT 'new' CHECK (segment IN ('new', 'regular', 'vip', 'at_risk')),
  ADD COLUMN acquisition_source text,
  ADD COLUMN preferred_branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  ADD COLUMN preferred_fulfillment text CHECK (preferred_fulfillment IN ('delivery', 'pickup', 'dine_in')),
  ADD COLUMN birthday date,
  ADD COLUMN last_seen_at timestamptz;

CREATE INDEX orders_customer_idx ON orders (business_id, customer_id, created_at DESC) WHERE customer_id IS NOT NULL;

CREATE TABLE customer_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  author_user_id uuid REFERENCES platform_users(id) ON DELETE SET NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX customer_notes_customer_idx ON customer_notes (business_id, customer_id, created_at DESC);

CREATE TABLE customer_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  label text NOT NULL,
  created_by uuid REFERENCES platform_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, label)
);

CREATE INDEX customer_tags_customer_idx ON customer_tags (business_id, customer_id);

INSERT INTO permissions (key) VALUES
  ('business:customer:read'),
  ('business:customer:write')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT roles.id, permissions.id
FROM roles
JOIN permissions ON
  (permissions.key = 'business:customer:read' AND roles.name IN ('OWNER', 'MANAGER', 'CASHIER', 'MARKETING', 'ANALYST')) OR
  (permissions.key = 'business:customer:write' AND roles.name IN ('OWNER', 'MANAGER', 'MARKETING'))
WHERE roles.scope = 'business'
ON CONFLICT DO NOTHING;
