# Deployment

Local infrastructure is defined in `docker-compose.yml` and currently contains
PostgreSQL and Redis. Public application, API, webhook, and provider endpoints
must use HTTPS in deployed environments. Keep staging databases, Redis,
Evolution instances, n8n environments, and test chats separate from
production.

The deployment command surface is intentionally defined by the root scripts and
must be kept in sync with this document as the workspace grows.

Coolify uses `docker-compose.coolify.yml` from the private Git repository. The
API container applies ordered migrations before starting, and only the API
service should receive the public domain. PostgreSQL and Redis are internal
services with persistent volumes.
