CREATE TABLE campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  discount_type text NOT NULL CHECK (discount_type IN ('percentage', 'fixed_amount')),
  discount_value integer NOT NULL CHECK (discount_value > 0),
  coupon_code text NOT NULL,
  min_order_amount_minor integer NOT NULL DEFAULT 0 CHECK (min_order_amount_minor >= 0),
  max_redemptions integer CHECK (max_redemptions IS NULL OR max_redemptions > 0),
  redemption_count integer NOT NULL DEFAULT 0 CHECK (redemption_count >= 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'active', 'paused', 'completed', 'archived')),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  created_by uuid REFERENCES platform_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (discount_type = 'percentage' AND discount_value <= 100) OR discount_type = 'fixed_amount'
  ),
  CHECK (ends_at IS NULL OR starts_at < ends_at)
);

CREATE UNIQUE INDEX campaigns_business_code_idx ON campaigns (business_id, coupon_code);
CREATE INDEX campaigns_business_status_idx ON campaigns (business_id, status);

ALTER TABLE order_adjustments ADD COLUMN campaign_id uuid REFERENCES campaigns(id) ON DELETE SET NULL;
CREATE INDEX order_adjustments_campaign_idx ON order_adjustments (business_id, campaign_id) WHERE campaign_id IS NOT NULL;

CREATE TABLE campaign_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN ('sent', 'clicked', 'redeemed')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX campaign_events_customer_idx ON campaign_events (business_id, customer_id, created_at DESC);
CREATE INDEX campaign_events_campaign_idx ON campaign_events (business_id, campaign_id, created_at DESC);

INSERT INTO permissions (key) VALUES
  ('business:campaign:read'),
  ('business:campaign:write')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT roles.id, permissions.id
FROM roles
JOIN permissions ON
  (permissions.key = 'business:campaign:read' AND roles.name IN ('OWNER', 'MANAGER', 'MARKETING', 'ANALYST')) OR
  (permissions.key = 'business:campaign:write' AND roles.name IN ('OWNER', 'MANAGER', 'MARKETING'))
WHERE roles.scope = 'business'
ON CONFLICT DO NOTHING;
