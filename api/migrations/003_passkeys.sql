CREATE TABLE IF NOT EXISTS user_passkeys (
    credential_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    public_key BYTEA NOT NULL,
    counter BIGINT NOT NULL DEFAULT 0,
    transports TEXT[] NOT NULL DEFAULT '{}',
    device_type VARCHAR(32) NOT NULL,
    backed_up BOOLEAN NOT NULL DEFAULT FALSE,
    name VARCHAR(120),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS user_passkeys_user_id_idx
    ON user_passkeys (user_id);

CREATE INDEX IF NOT EXISTS user_passkeys_last_used_at_idx
    ON user_passkeys (last_used_at);