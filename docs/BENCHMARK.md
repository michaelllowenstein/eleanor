# Benchmark summary

Run `npm run benchmark` on the same Node version and region used in production.

The bundled benchmark covers local deterministic hot paths only:

- all 155,520 profile encodings and collision detection
- 25,000 AES-256-GCM encrypt/decrypt round trips
- 100,000 secure random token generations

It does not fabricate network timings.

Suggested production p95 budgets:

| Stage | p95 budget |
| --- | ---: |
| profile encode/decode | < 1 ms |
| Redis session read | < 10 ms |
| Redis rate-limit mutation | < 10 ms |
| PostgreSQL credential/profile read | < 50 ms |
| passkey options server endpoint | < 100 ms |
| passkey verify server endpoint | < 100 ms |
| BFF work before provider call | < 100 ms |
| OpenAI Realtime call creation | measure p50/p95/p99 |
| browser WebRTC negotiation | measure p50/p95/p99 |
| speech-end → first audio | primary user-facing SLO |

WebAuthn ceremony wall-clock time is human/authenticator dependent and should be reported
separately from server verification latency.
