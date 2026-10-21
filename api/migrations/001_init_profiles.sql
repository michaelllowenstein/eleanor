-- 001: assistant profile storage.
--
-- The pre-release version of this file referenced columns that never existed
-- (assistant_profiles.id, assistant_profiles.is_active) and therefore always
-- failed inside its transaction. It was never successfully applied anywhere,
-- so it is safe to correct in place. Users and ownership constraints are
-- introduced in 004 so that databases created by the v0.7 snapshot (which had
-- these tables but no schema_migrations rows) converge to the same schema.

CREATE TABLE IF NOT EXISTS assistant_profiles (
    user_id        TEXT        PRIMARY KEY,
    profile_metric BIGINT      NOT NULL,
    schema_version SMALLINT    NOT NULL DEFAULT 1,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT assistant_profiles_schema_version_positive
        CHECK (schema_version > 0)
);

CREATE INDEX IF NOT EXISTS assistant_profiles_updated_at_idx
    ON assistant_profiles (updated_at);
