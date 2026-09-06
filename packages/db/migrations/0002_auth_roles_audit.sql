ALTER TABLE platform_users
  ADD COLUMN token_version integer NOT NULL DEFAULT 0;

CREATE TABLE user_credentials (
  user_id uuid PRIMARY KEY REFERENCES platform_users(id) ON DELETE CASCADE,
  password_hash text NOT NULL,
  password_changed_at timestamptz NOT NULL DEFAULT now(),
  failed_login_attempts integer NOT NULL DEFAULT 0 CHECK (failed_login_attempts >= 0),
  locked_until timestamptz
);

CREATE TABLE refresh_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('platform', 'business')),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  family uuid NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  replaced_by uuid REFERENCES refresh_tokens(id) ON DELETE SET NULL,
  ip_address inet,
  user_agent text
);

CREATE INDEX refresh_tokens_user_id_idx ON refresh_tokens (user_id);
CREATE INDEX refresh_tokens_family_idx ON refresh_tokens (family);
CREATE INDEX refresh_tokens_business_id_idx ON refresh_tokens (business_id);

CREATE TABLE platform_user_roles (
  user_id uuid NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);

ALTER TABLE audit_logs
  ADD COLUMN actor_role text,
  ADD COLUMN before_json jsonb,
  ADD COLUMN after_json jsonb,
  ADD COLUMN user_agent text;

CREATE UNIQUE INDEX idempotency_keys_platform_key_idx
  ON idempotency_keys (scope, key)
  WHERE business_id IS NULL;

INSERT INTO permissions (key)
VALUES
  ('platform:business:read'),
  ('platform:business:create'),
  ('platform:business:update'),
  ('platform:user:role:update'),
  ('business:business:read'),
  ('business:business:update'),
  ('business:branch:read'),
  ('business:branch:create'),
  ('business:user:read'),
  ('business:user:role:update')
ON CONFLICT (key) DO NOTHING;

INSERT INTO roles (name, scope)
VALUES
  ('SUPER_ADMIN', 'platform'),
  ('PLATFORM_SUPPORT', 'platform'),
  ('OWNER', 'business'),
  ('MANAGER', 'business')
ON CONFLICT (scope, name) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT roles.id, permissions.id
FROM roles
JOIN permissions ON (
  (roles.name = 'SUPER_ADMIN' AND permissions.key IN (
    'platform:business:read',
    'platform:business:create',
    'platform:business:update',
    'platform:user:role:update'
  )) OR
  (roles.name = 'PLATFORM_SUPPORT' AND permissions.key = 'platform:business:read') OR
  (roles.name = 'OWNER' AND permissions.key IN (
    'business:business:read',
    'business:business:update',
    'business:branch:read',
    'business:branch:create',
    'business:user:read',
    'business:user:role:update'
  )) OR
  (roles.name = 'MANAGER' AND permissions.key IN (
    'business:business:read',
    'business:branch:read',
    'business:user:read'
  ))
)
ON CONFLICT DO NOTHING;
