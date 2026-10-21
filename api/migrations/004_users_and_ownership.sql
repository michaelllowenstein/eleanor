-- 004: first-class users and ownership.
--
-- users.id is the OIDC subject ("sub") of the identity provider configured in
-- OIDC_ISSUER. Every per-user table now references users(id) with ON DELETE
-- CASCADE so that account deletion is a single DELETE FROM users.
--
-- Idempotent: safe on fresh databases and on databases created by the v0.7
-- snapshot. Existing user ids are backfilled before constraints are added.

CREATE TABLE IF NOT EXISTS users (
    id            TEXT        PRIMARY KEY,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMPTZ
);

INSERT INTO users (id)
SELECT user_id FROM assistant_profiles
UNION SELECT user_id FROM user_provider_credentials
UNION SELECT user_id FROM user_passkeys
ON CONFLICT (id) DO NOTHING;

-- v1 profile metric range (see api/src/modules/profile/metric.ts).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'assistant_profiles_metric_v1_range'
    ) THEN
        ALTER TABLE assistant_profiles
            ADD CONSTRAINT assistant_profiles_metric_v1_range
            CHECK (schema_version <> 1 OR profile_metric BETWEEN 1000000 AND 1155519);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'assistant_profiles_user_fk'
    ) THEN
        ALTER TABLE assistant_profiles
            ADD CONSTRAINT assistant_profiles_user_fk
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'user_provider_credentials_user_fk'
    ) THEN
        ALTER TABLE user_provider_credentials
            ADD CONSTRAINT user_provider_credentials_user_fk
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'user_passkeys_user_fk'
    ) THEN
        ALTER TABLE user_passkeys
            ADD CONSTRAINT user_passkeys_user_fk
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;
    END IF;
END
$$;
