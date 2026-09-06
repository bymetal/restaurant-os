INSERT INTO permissions (key) VALUES ('business:analytics:read')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT roles.id, permissions.id
FROM roles
JOIN permissions ON permissions.key = 'business:analytics:read'
WHERE roles.scope = 'business'
  AND roles.name IN ('OWNER', 'MANAGER', 'MARKETING', 'ANALYST')
ON CONFLICT DO NOTHING;
