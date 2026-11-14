# Eleanor — observability + deployment iteration

Copy this folder over the repository root. Then:

```bash
git rm api/src/middleware/request-id.ts      # replaced by request-context.ts
npm run migrate -w @eleanor/api               # applies 005_audit_events.sql
npm run local
```

**Before you overwrite:** these files are full replacements of the versions in
the v0.1 export plus the runbook patches P1–P6. If you've edited any of them
since (for example the voice-reconnect snippet in `realtime.ts`), diff first.
`client/src/app/routes.ts` and `APP_PATHS` (patch P4) are not touched.

## Logging, tracing, audit (see docs/OBSERVABILITY.md)

| File | Change |
| --- | --- |
| `api/src/core/logger.ts` | Category loggers (`child({category})`), per-category levels (`LOG_TRACE`), json/pretty formats, automatic request context, redaction of every field |
| `api/src/core/context.ts` | AsyncLocalStorage request context: requestId, traceId, hashed userRef |
| `api/src/core/redact.ts` | Masks secret keys, API keys, bearer tokens; never keeps raw SDP |
| `api/src/core/trace.ts` | `startSpan()` timing helper (`.start` / `.done` / `.failed`) |
| `api/src/middleware/request-context.ts` | Request/trace ids, context binding, access log, `no-store` on all `/api` responses |
| `api/src/middleware/origin-guard.ts` | Rejects requests that bypass Vercel (`ORIGIN_SECRET`) |
| `api/src/middleware/rate-limit.ts` | Key prefix per limiter, structured logging |
| `api/src/modules/realtime/provider.ts` | Traced OpenAI call: offer/answer outlines, OpenAI request id, call id, parsed upstream error; new codes `PROVIDER_QUOTA_EXHAUSTED`, `PROVIDER_REJECTED_CONFIG`, `PROVIDER_UNREACHABLE`; mock provider (P3) |
| `api/src/modules/realtime/routes.ts` | Trace-aware session route, `X-Eleanor-Call-Id`, clearer error messages, audit events |
| `api/src/modules/realtime/sdp.ts` | Safe SDP outline (media order, codecs, candidate count) |
| `api/src/modules/telemetry/routes.ts` | `POST /api/telemetry/client` (batched browser logs → API logs + audit) |
| `api/src/modules/audit/*` + `migrations/005_audit_events.sql` | Per-user audit trail, auto-recorded security/settings changes, `GET /api/audit-trail`, retention pruning |
| `api/src/modules/auth/routes.ts` | `ALLOWED_EMAILS` allowlist, auth logging and audit |
| `api/src/modules/auth/oidc/service.ts` | `OIDC_REAUTH_PROMPT` (Google needs it empty), `emailVerified` |
| `api/src/core/config.ts` | New variables (see `api/.env.example`); config errors print once and exit 1 |
| `api/src/app.ts`, `api/src/server.ts` | Wiring; boot logs; audit pruning; unhandled-rejection logging |
| `client/src/app/core/services/log.ts` | `LogService`: console / API / in-memory sinks, per-category levels, traces, audit, `eleanorLog` devtools handle |
| `client/src/app/core/transport/webrtc-realtime.ts` | Full WebRTC tracing incl. ICE, data channel, getStats snapshots, mock-answer guard |
| `client/src/app/core/services/realtime.ts` | Session trace id, turn latency (`response.first_audio`), usage, settings + response audit |
| `client/src/app/core/services/audit.ts` | `AuditTrailService` for a future audit view |
| `client/src/app/config.ts` | Transport provider with logging (P2), global `ErrorHandler` → logs |
| `client/src/envs/*.ts`, `client/src/types/index.ts` | `logging` defaults, `appVersion` |

## Build and deploy

| File | Change |
| --- | --- |
| `api/src/types/express.d.ts` | Request typing (P5) |
| `api/tsconfig.json` | `rootDir: "src"` (P6); tests excluded from the build |
| `api/vitest.config.ts` | Runs `*.spec.ts` and `*.integration.ts` |
| `Dockerfile`, `.dockerignore` | API image for Railway (workspace-aware, prod deps only, non-root) |
| `vercel.json` | Angular build from the workspace, `/api` proxy to Railway with `x-origin-secret`, caching off, SPA fallback, security headers |
| `.github/workflows/ci.yml` | API build + tests (with Postgres), client prod build, image build, gitleaks |
| `api/docker-compose.yml` | Postgres, Redis, mock OIDC |
| `.nvmrc` | `22` |
