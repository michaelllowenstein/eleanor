CREATE TABLE IF NOT EXISTS user_provider_credentials (
    user_id TEXT PRIMARY KEY,
    provider VARCHAR(32) NOT NULL,
    encrypted_api_key TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT provider_supported CHECK (provider IN ('openai'))
);
CREATE INDEX IF NOT EXISTS user_provider_credentials_provider_idx ON user_provider_credentials (provider);