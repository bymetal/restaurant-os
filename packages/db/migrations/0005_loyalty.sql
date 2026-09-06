CREATE TABLE loyalty_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  reward_description text NOT NULL,
  goal_count integer NOT NULL CHECK (goal_count > 0),
  earn_per_order integer NOT NULL DEFAULT 1 CHECK (earn_per_order > 0),
  min_order_amount_minor integer NOT NULL DEFAULT 0 CHECK (min_order_amount_minor >= 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX loyalty_programs_business_active_idx
  ON loyalty_programs (business_id) WHERE active = true;

CREATE TABLE loyalty_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  program_id uuid NOT NULL REFERENCES loyalty_programs(id) ON DELETE CASCADE,
  balance integer NOT NULL DEFAULT 0 CHECK (balance >= 0),
  lifetime_earned integer NOT NULL DEFAULT 0 CHECK (lifetime_earned >= 0),
  lifetime_redeemed integer NOT NULL DEFAULT 0 CHECK (lifetime_redeemed >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, customer_id, program_id)
);

CREATE TABLE loyalty_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  loyalty_account_id uuid NOT NULL REFERENCES loyalty_accounts(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  transaction_type text NOT NULL CHECK (transaction_type IN ('EARN', 'ADJUSTMENT_ADD', 'ADJUSTMENT_REMOVE', 'REDEEM')),
  amount integer NOT NULL CHECK (amount > 0),
  balance_after integer NOT NULL CHECK (balance_after >= 0),
  actor_type text NOT NULL CHECK (actor_type IN ('system', 'user')),
  actor_user_id uuid REFERENCES platform_users(id) ON DELETE SET NULL,
  reason text,
  idempotency_key text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX loyalty_transactions_account_idx ON loyalty_transactions (loyalty_account_id, created_at DESC);
CREATE INDEX loyalty_transactions_customer_idx ON loyalty_transactions (business_id, customer_id, created_at DESC);
CREATE UNIQUE INDEX loyalty_transactions_idempotency_idx
  ON loyalty_transactions (business_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

ALTER TABLE carts ADD COLUMN customer_id uuid REFERENCES customers(id) ON DELETE SET NULL;
CREATE INDEX carts_customer_idx ON carts (business_id, customer_id) WHERE customer_id IS NOT NULL;

INSERT INTO permissions (key) VALUES
  ('business:loyalty:read'),
  ('business:loyalty:redeem'),
  ('business:loyalty:write')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT roles.id, permissions.id
FROM roles
JOIN permissions ON
  (permissions.key = 'business:loyalty:read' AND roles.name IN ('OWNER', 'MANAGER', 'CASHIER', 'MARKETING', 'ANALYST')) OR
  (permissions.key = 'business:loyalty:redeem' AND roles.name IN ('OWNER', 'MANAGER', 'CASHIER')) OR
  (permissions.key = 'business:loyalty:write' AND roles.name IN ('OWNER', 'MANAGER'))
WHERE roles.scope = 'business'
ON CONFLICT DO NOTHING;
