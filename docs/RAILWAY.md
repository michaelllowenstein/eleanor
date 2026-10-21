# Railway deployment

Deploy `apps/api` as a Railway service from the monorepo root and point the service's
Config-as-Code file at `/railway.json`.

Provision both PostgreSQL and Redis in the same Railway project.

Recommended API variables:

```env
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
OPENAI_API_KEY=...
AUTH_JWKS_URL=...
AUTH_ISSUER=...
AUTH_AUDIENCE=eleanor-api
WEB_ORIGINS=https://your-vercel-app.example
REALTIME_SESSION_RATE_LIMIT_PER_MINUTE=20
```

Railway injects `PORT`; do not hard-code it in production.

For staging:

```bash
railway environment new staging --copy production
```

For multiple API replicas, the Redis-backed limiter remains shared across instances.
The service is stateless apart from PostgreSQL/Redis, so no sticky HTTP sessions are
required.
