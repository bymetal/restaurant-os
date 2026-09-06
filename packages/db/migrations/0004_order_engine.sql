CREATE TABLE customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  phone text NOT NULL,
  name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, phone)
);

CREATE INDEX customers_business_created_idx ON customers (business_id, created_at DESC);

CREATE TABLE customer_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  label text,
  address_text text NOT NULL,
  district text,
  city text,
  postal_code text,
  lat double precision,
  lng double precision,
  building text,
  apartment text,
  floor text,
  instructions text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX customer_addresses_customer_idx ON customer_addresses (business_id, customer_id);

CREATE TABLE delivery_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  name text NOT NULL,
  districts jsonb NOT NULL DEFAULT '[]'::jsonb,
  postal_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  radius_km double precision,
  min_order_minor integer NOT NULL DEFAULT 0 CHECK (min_order_minor >= 0),
  delivery_fee_minor integer NOT NULL DEFAULT 0 CHECK (delivery_fee_minor >= 0),
  free_delivery_threshold_minor integer CHECK (free_delivery_threshold_minor IS NULL OR free_delivery_threshold_minor >= 0),
  estimated_minutes integer NOT NULL DEFAULT 30 CHECK (estimated_minutes > 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX delivery_zones_branch_idx ON delivery_zones (business_id, branch_id, active);

CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  cart_id uuid REFERENCES carts(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  order_number integer NOT NULL CHECK (order_number > 0),
  fulfillment_type text NOT NULL CHECK (fulfillment_type IN ('delivery', 'pickup', 'dine_in')),
  scheduled_for timestamptz,
  status text NOT NULL DEFAULT 'PLACED' CHECK (status IN ('DRAFT', 'PLACED', 'ACCEPTED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'REJECTED', 'CANCELLED', 'REFUNDED')),
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  customer_name_snapshot text NOT NULL,
  customer_phone_snapshot text NOT NULL,
  address_snapshot jsonb,
  note text,
  delivery_instructions text,
  items_subtotal_minor integer NOT NULL CHECK (items_subtotal_minor >= 0),
  delivery_fee_minor integer NOT NULL DEFAULT 0 CHECK (delivery_fee_minor >= 0),
  discount_minor integer NOT NULL DEFAULT 0 CHECK (discount_minor >= 0),
  tax_minor integer NOT NULL DEFAULT 0 CHECK (tax_minor >= 0),
  total_minor integer NOT NULL CHECK (total_minor >= 0),
  placed_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  preparing_at timestamptz,
  ready_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, order_number),
  CONSTRAINT orders_total_consistency CHECK (
    total_minor = items_subtotal_minor + delivery_fee_minor + tax_minor - discount_minor
  )
);

CREATE INDEX orders_business_created_idx ON orders (business_id, created_at DESC);
CREATE INDEX orders_business_branch_status_idx ON orders (business_id, branch_id, status, created_at DESC);

CREATE TABLE order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  product_id uuid REFERENCES products(id) ON DELETE RESTRICT,
  variant_id uuid REFERENCES product_variants(id) ON DELETE RESTRICT,
  product_name_snapshot text NOT NULL,
  variant_name_snapshot text,
  product_unit_price integer NOT NULL CHECK (product_unit_price >= 0),
  variant_price_adjustment integer NOT NULL DEFAULT 0,
  unit_price integer NOT NULL CHECK (unit_price >= 0),
  quantity integer NOT NULL CHECK (quantity > 0),
  tax integer NOT NULL DEFAULT 0 CHECK (tax >= 0),
  discount integer NOT NULL DEFAULT 0 CHECK (discount >= 0),
  line_total integer NOT NULL CHECK (line_total >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX order_items_order_idx ON order_items (order_id, created_at);
CREATE INDEX order_items_business_idx ON order_items (business_id, branch_id, created_at DESC);

CREATE TABLE order_item_modifiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id uuid NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  modifier_id uuid REFERENCES modifiers(id) ON DELETE RESTRICT,
  modifier_name_snapshot text NOT NULL,
  modifier_price_adjustment integer NOT NULL DEFAULT 0 CHECK (modifier_price_adjustment >= 0)
);

CREATE INDEX order_item_modifiers_order_item_idx ON order_item_modifiers (order_item_id);

CREATE TABLE order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  from_status text,
  to_status text NOT NULL,
  actor_type text NOT NULL CHECK (actor_type IN ('system', 'customer', 'user')),
  actor_user_id uuid REFERENCES platform_users(id) ON DELETE SET NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX order_events_order_idx ON order_events (order_id, created_at);

CREATE TABLE order_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  method text NOT NULL CHECK (method IN ('cash', 'card_on_delivery', 'pay_at_restaurant', 'online')),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'CAPTURED_OFFLINE', 'CAPTURED', 'AUTHORIZED', 'REFUNDED', 'FAILED')),
  amount_minor integer NOT NULL CHECK (amount_minor >= 0),
  provider text,
  provider_payment_id text,
  provider_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX order_payments_provider_payment_idx
  ON order_payments (provider, provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;

CREATE TABLE order_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  type text NOT NULL,
  amount_minor integer NOT NULL CHECK (amount_minor >= 0),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO roles (name, scope)
VALUES ('CASHIER', 'business'), ('KITCHEN', 'business')
ON CONFLICT (scope, name) DO NOTHING;

INSERT INTO permissions (key)
VALUES
  ('business:order:read'),
  ('business:order:update')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT roles.id, permissions.id
FROM roles
JOIN permissions ON permissions.key IN ('business:order:read', 'business:order:update')
WHERE roles.scope = 'business'
  AND roles.name IN ('OWNER', 'MANAGER', 'CASHIER', 'KITCHEN')
ON CONFLICT DO NOTHING;
