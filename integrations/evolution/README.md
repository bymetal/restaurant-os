# Evolution Adapter

Evolution API is the initial WhatsApp provider implementation. Keep its
endpoints, authentication, payload mapping, and webhook behavior behind an
adapter. Verify the deployed version in staging, especially `MESSAGES_UPSERT`,
before implementing the integration phase.
