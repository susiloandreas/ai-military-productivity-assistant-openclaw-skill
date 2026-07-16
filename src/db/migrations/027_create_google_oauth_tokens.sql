-- Google OAuth tokens for Calendar access. One row per user; the refresh_token
-- is the long-lived credential (Google only returns it on the FIRST consent with
-- access_type=offline & prompt=consent), while access_token is short-lived (~1h)
-- and re-minted from the refresh_token as needed. expiry_date is the access
-- token's absolute expiry in epoch milliseconds, so staleness is a cheap compare.
CREATE TABLE IF NOT EXISTS google_oauth_tokens (
  user_id       UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  access_token  TEXT,
  refresh_token TEXT,
  scope         TEXT,
  token_type    TEXT,
  expiry_date   BIGINT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
