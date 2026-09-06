ALTER TABLE branches ADD COLUMN slug text;

UPDATE branches
SET slug = COALESCE(
  NULLIF(trim(both '-' FROM regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g')), ''),
  'branch-' || left(id::text, 8)
)
WHERE slug IS NULL;

ALTER TABLE branches ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX branches_business_slug_idx ON branches (business_id, slug);

CREATE TABLE categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, name)
);

CREATE INDEX categories_business_sort_idx ON categories (business_id, sort_order, created_at);

CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  photo_url text,
  base_price integer NOT NULL CHECK (base_price >= 0),
  allergens jsonb NOT NULL DEFAULT '[]'::jsonb,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  prep_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX products_business_category_idx ON products (business_id, category_id, sort_order);
CREATE INDEX products_business_active_idx ON products (business_id, active);

CREATE TABLE product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name text NOT NULL,
  price_adjustment integer NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, name)
);

CREATE INDEX product_variants_business_product_idx ON product_variants (business_id, product_id, sort_order);

CREATE TABLE modifier_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name text NOT NULL,
  required boolean NOT NULL DEFAULT false,
  min_selections integer NOT NULL DEFAULT 0 CHECK (min_selections >= 0),
  max_selections integer NOT NULL DEFAULT 1 CHECK (max_selections >= min_selections),
  multi_select boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, name)
);

CREATE TABLE modifiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  modifier_group_id uuid NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
  name text NOT NULL,
  price_adjustment integer NOT NULL DEFAULT 0 CHECK (price_adjustment >= 0),
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (modifier_group_id, name)
);

CREATE INDEX modifiers_business_group_idx ON modifiers (business_id, modifier_group_id, sort_order);

CREATE TABLE product_branch_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  available boolean NOT NULL DEFAULT true,
  available_from timestamptz,
  available_until timestamptz,
  schedule jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, branch_id),
  CHECK (available_from IS NULL OR available_until IS NULL OR available_from < available_until)
);

CREATE INDEX product_availability_branch_idx ON product_branch_availability (business_id, branch_id, product_id);

CREATE TABLE carts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  session_token_hash text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'checked_out', 'abandoned')),
  source text,
  started_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_active_at timestamptz NOT NULL DEFAULT now(),
  checked_out_at timestamptz,
  abandoned_at timestamptz,
  recovered_at timestamptz
);

CREATE UNIQUE INDEX carts_active_session_branch_idx
  ON carts (session_token_hash, branch_id)
  WHERE status = 'active';
CREATE INDEX carts_business_branch_idx ON carts (business_id, branch_id, status);

CREATE TABLE cart_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id uuid NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  product_name_snapshot text NOT NULL,
  product_unit_price integer NOT NULL CHECK (product_unit_price >= 0),
  variant_id uuid REFERENCES product_variants(id) ON DELETE RESTRICT,
  variant_name_snapshot text,
  variant_price_adjustment integer NOT NULL DEFAULT 0,
  quantity integer NOT NULL CHECK (quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX cart_items_cart_idx ON cart_items (cart_id, created_at);

CREATE TABLE cart_item_modifiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_item_id uuid NOT NULL REFERENCES cart_items(id) ON DELETE CASCADE,
  modifier_id uuid NOT NULL REFERENCES modifiers(id) ON DELETE RESTRICT,
  modifier_name_snapshot text NOT NULL,
  modifier_price_adjustment integer NOT NULL DEFAULT 0 CHECK (modifier_price_adjustment >= 0)
);

CREATE INDEX cart_item_modifiers_item_idx ON cart_item_modifiers (cart_item_id);

INSERT INTO permissions (key)
VALUES ('business:menu:read'), ('business:menu:write')
ON CONFLICT (key) DO NOTHING;

INSERT INTO roles (name, scope)
VALUES ('MARKETING', 'business')
ON CONFLICT (scope, name) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT roles.id, permissions.id
FROM roles
JOIN permissions ON permissions.key IN ('business:menu:read', 'business:menu:write')
WHERE roles.scope = 'business'
  AND (
    roles.name IN ('OWNER', 'MANAGER') OR
    (roles.name = 'MARKETING' AND permissions.key = 'business:menu:read')
  )
ON CONFLICT DO NOTHING;
