-- 005: per-user audit trail.
--
-- One row per notable event in a user's Eleanor instance: sign-in, security
-- changes, settings in force, realtime session lifecycle and per-response
-- metadata. It is the data behind a future "why did Eleanor do that" view.
--
-- Never stores secrets, raw SDP or (for now) user utterances. Rows are
-- removed with the user (ON DELETE CASCADE) and pruned after
-- AUDIT_RETENTION_DAYS by the API.

CREATE TABLE IF NOT EXISTS audit_events (
    id          BIGSERIAL    PRIMARY KEY,
    user_id     TEXT         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    trace_id    TEXT,
    kind        VARCHAR(64)  NOT NULL,
    source      VARCHAR(16)  NOT NULL,
    summary     TEXT         NOT NULL,
    data        JSONB        NOT NULL DEFAULT '{}'::jsonb,
    occurred_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT audit_events_source_valid CHECK (source IN ('api', 'client'))
);

CREATE INDEX IF NOT EXISTS audit_events_user_time_idx
    ON audit_events (user_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS audit_events_trace_idx
    ON audit_events (trace_id)
    WHERE trace_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS audit_events_occurred_at_idx
    ON audit_events (occurred_at);
