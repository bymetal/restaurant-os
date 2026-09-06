CREATE TABLE billing_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (code IN ('starter', 'growth', 'pro')),
  name text NOT NULL,
  monthly_price_minor integer NOT NULL CHECK (monthly_price_minor >= 0),
  currency char(3) NOT NULL DEFAULT 'TRY',
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO billing_plans (code, name, monthly_price_minor) VALUES
  ('starter', 'Starter', 149000),
  ('growth', 'Growth', 299000),
  ('pro', 'Pro', 599000);

CREATE TABLE business_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL UNIQUE REFERENCES businesses(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES billing_plans(id),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'trialing', 'past_due', 'cancelled')),
  started_at timestamptz NOT NULL DEFAULT now(),
  current_period_end timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE integration_health (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  integration_type text NOT NULL CHECK (integration_type IN ('whatsapp', 'printer', 'webhook', 'payment')),
  status text NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected', 'disconnected', 'degraded')),
  last_checked_at timestamptz,
  last_error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, integration_type)
);

CREATE TABLE system_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_type text NOT NULL CHECK (issue_type IN ('whatsapp_disconnected', 'printer_offline', 'subscription_payment_failed', 'webhook_error')),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  severity text NOT NULL DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'critical')),
  description text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX system_issues_open_idx ON system_issues (issue_type, status) WHERE status = 'open';

INSERT INTO permissions (key) VALUES
  ('platform:analytics:read'),
  ('platform:subscription:write'),
  ('platform:system_issue:update')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT roles.id, permissions.id
FROM roles
JOIN permissions ON
  (permissions.key = 'platform:analytics:read' AND roles.name IN ('SUPER_ADMIN', 'PLATFORM_SUPPORT')) OR
  (permissions.key = 'platform:subscription:write' AND roles.name = 'SUPER_ADMIN') OR
  (permissions.key = 'platform:system_issue:update' AND roles.name IN ('SUPER_ADMIN', 'PLATFORM_SUPPORT'))
WHERE roles.scope = 'platform'
ON CONFLICT DO NOTHING;
