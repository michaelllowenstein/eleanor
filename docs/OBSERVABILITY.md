# Observability: logging, tracing and the audit trail

Eleanor records four kinds of information:

| What | Where it goes | Who sees it | Retention |
| --- | --- | --- | --- |
| API logs | stdout/stderr as JSON → Railway logs | you (operator) | platform log retention |
| Browser logs | batched to `POST /api/telemetry/client` → re-emitted as API logs under `client.*` | you | same as API logs |
| Flight recorder | last 2,000 browser entries in memory, every level | the user, via `eleanorLog.download()` | until page reload |
| Audit trail | `audit_events` table, per user | the user (`GET /api/audit-trail`), later in the UI | `AUDIT_RETENTION_DAYS` (30) |

Nothing records secrets, raw SDP, or user speech. Every field passes through
`redact()` (API `core/redact.ts`, client `schema/utils/redact.ts`): keys that
look like secrets become `[redacted]`, SDP becomes `[sdp N bytes]`, and
`sk-…` keys and bearer tokens in free text are masked.

## Correlation ids

| Id | Scope | Carried by |
| --- | --- | --- |
| `traceId` | one voice session (Activate → Stop) | `X-Eleanor-Trace-Id` on the SDP exchange; every client log entry; audit rows |
| `requestId` | one HTTP request | `X-Request-Id` response header; every API log line in that request |
| `callId` | one OpenAI realtime call | OpenAI's `Location` header → `X-Eleanor-Call-Id` → client logs and audit |
| `userRef` | one user | 12-char SHA-256 prefix of the OIDC subject; never the raw id or email |
| `clientId` | one browser tab / page load | telemetry batches |

**To trace a failed session:** in the browser console run `eleanorLog.trace()`
(during the session) or find the `traceId` in `eleanorLog.dump()`. Then search
Railway logs for that id: you get the browser side (`client.realtime.*`), the
API route (`realtime.*`), and the provider call (`provider.create_call.*`) in
order.

## API configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `LOG_LEVEL` | `info` | Default threshold for all categories |
| `LOG_TRACE` | — | Per-category overrides, e.g. `realtime=debug,provider=debug,http=warn,client=info`. A category `client.realtime.webrtc` falls back to `client`, then `*`, then `LOG_LEVEL` |
| `LOG_FORMAT` | `pretty` dev, `json` prod | JSON lines use `level` and `message` keys (Railway parses them) |
| `CLIENT_LOG_INGEST` | `true` | Accept browser log batches |
| `TELEMETRY_RATE_LIMIT_PER_MINUTE` | `120` | Batches per user per minute |
| `AUDIT_TRAIL_ENABLED` | `true` | Write `audit_events` rows |
| `AUDIT_RETENTION_DAYS` | `30` | Pruned at startup and daily |

### API categories

| Category | Events |
| --- | --- |
| `boot` | `config.loaded`, `config.warning`, `oidc.discovered`, `oidc.discovery_retry` (now includes the network cause, e.g. `ECONNREFUSED`), `server.listening`, `server.shutdown` |
| `http` | `http.request` (method, path without query, status, durationMs), `http.origin_rejected`, `http.unhandled` |
| `auth` | `auth.login_started`, `auth.login`, `auth.not_allowed`, `auth.account_mismatch`, `auth.callback_failed`, `auth.logout` |
| `realtime` | `realtime.offer_received` (SDP outline), `realtime.profile_resolved`, `realtime.credential_missing`, `realtime.session_created` (durationMs, callId), `realtime.session_failed` (code, upstream status, upstream error type/code/message) |
| `provider` | `provider.create_call.start` / `.done` / `.failed` with model, voice, VAD eagerness, offer and answer outlines, OpenAI request id |
| `ratelimit` | `ratelimit.exceeded`, `ratelimit.unavailable` |
| `audit` | `audit.event` (debug), `audit.write_failed`, `audit.pruned` |
| `health` | `health.dependency_down` |
| `client.*` | everything the browser sends |

### Provider error codes (502 responses)

| Code | Meaning |
| --- | --- |
| `PROVIDER_AUTH_FAILED` | 401/403: key rejected |
| `PROVIDER_QUOTA_EXHAUSTED` | 429 with `insufficient_quota`: no credit or spend cap reached |
| `PROVIDER_RATE_LIMITED` | other 429 |
| `PROVIDER_REJECTED_CONFIG` | 400/404/422: a session field or the model was rejected; `upstream.param` names the field |
| `PROVIDER_UNREACHABLE` | network error or 20 s timeout |
| `PROVIDER_UNAVAILABLE` | other upstream failure |
| `PROVIDER_BAD_RESPONSE` | 2xx without an SDP body |

## Client configuration

Build defaults live in `client/src/envs/env*.ts` (`logging`). Change them at
runtime from the devtools console, with no rebuild. Changes persist in
`localStorage["eleanor.log"]`:

```js
eleanorLog.set({ console: { "*": "debug" } })              // everything to the console
eleanorLog.set({ remote: { "realtime": "debug" } })        // full realtime detail to the API
eleanorLog.set({ console: { "realtime.webrtc": "off" } })  // silence one category
eleanorLog.reset()        // back to build defaults
eleanorLog.dump()         // in-memory entries
eleanorLog.download()     // save them as JSON (attach to a bug report)
eleanorLog.flush()        // send queued entries now
```

### Client categories

| Category | Events |
| --- | --- |
| `realtime` | `session.activate`, `mic.granted` / `mic.denied`, `sdp.exchanged` / `sdp.exchange_failed` (status, code, upstreamCode, requestId, callId), `session.connected`, `session.created`, `settings.applied`, `turn.user_started` / `turn.user_stopped` / `turn.barge_in`, `response.created`, `response.first_audio` (**turnLatencyMs** = user stopped → Eleanor's first audio), `response.done` (status, usage, latencies), `server.error`, `session.ended` |
| `realtime.webrtc` | `track.local` / `track.remote`, `sdp.offer` / `sdp.answer` (outlines), `sdp.answer_rejected` (both outlines, for m-line mismatches), `sdp.answer_is_mock`, `signaling.state`, `ice.gathering`, `ice.connection`, `ice.candidate_error`, `peer.*`, `datachannel.*`, `event.received` (type and ids; `.delta` events counted only), `event.sent`, `stats.connected` / `stats.failed` / `stats.closing` (candidate types, protocol, RTT, jitter, packet loss) |
| `app` | `unhandled`: anything Angular's ErrorHandler sees |

`response.first_audio` and `response.done` replace the temporary Run 001
benchmark snippet: the turn-latency numbers are now always recorded.

## Audit trail

One row per notable event, per user, in plain language plus structured data.
Each voice session shares one `traceId`, so a session can be replayed as a
story: which settings were in force, what Eleanor did each turn, how long it
took, and what it cost.

| Kind | Source | Summary example | Data |
| --- | --- | --- | --- |
| `auth.login` / `auth.logout` | api | "Signed in." | reauth |
| `passkey.registered` / `passkey.step_up` | api | "Verified with a passkey." | — |
| `credential.saved` / `credential.removed` | api | "Saved a provider API key." | provider |
| `profile.updated` | api | "Changed Eleanor's settings." | metric, decoded settings |
| `realtime.session_started` | api | "Started a gpt-realtime-2.1 voice session with the marin voice (warm, brief)." | callId, profile, session config sent to OpenAI incl. instructions |
| `realtime.session_failed` | api | "Couldn't start a voice session: …" | code, upstream status/code |
| `realtime.settings_applied` | client | "Applied settings: warm, brief, casual, …" | settings, instructions, max tokens, VAD eagerness, voice lock |
| `realtime.response` | client | "Responded (completed); started speaking 840 ms after you stopped." | responseId, status, usage (tokens), latencies, settings |
| `realtime.turn` | client | "You interrupted Eleanor; she stopped speaking." | turn |
| `realtime.error` | client | the error message | stage, type, code, param |
| `realtime.session_ended` | client | "Ended the voice session after 312 s (14 responses)." | duration, turns, responses, barge-ins |

Read it: `GET /api/audit-trail?limit=50&traceId=<id>&before=<id>` (client:
`AuditTrailService`).

### Extending it toward "why Eleanor did that"

- **Reasoning:** `reasoning.effort` is recorded with each session. The Realtime
  API returns usage counts, not the model's private reasoning, so the trail
  explains decisions from what is observable: settings and instructions in
  force, turn boundaries detected by VAD, interruptions, response status and
  token usage. Check OpenAI's current Realtime docs for any reasoning-summary
  field before promising more.
- **Transcripts (opt-in):** enable input transcription in the session config
  and record `conversation.item.input_audio_transcription.completed` and
  `response.output_audio_transcript.done` as new audit kinds. This stores user
  speech, so gate it behind a per-user setting and show it in the UI.
- **Tools:** when Eleanor gains tools, record each `function_call` (name,
  arguments after redaction, result status) as `realtime.tool_call`. That is
  where "never claim an external action succeeded unless a trusted tool
  confirms it" becomes auditable.
- Add new kinds to `API_AUDIT_KINDS` / `CLIENT_AUDIT_KINDS`
  (`api/src/modules/audit/types.ts`) and to `ClientAuditKind`
  (`client/src/app/core/services/log.ts`).
