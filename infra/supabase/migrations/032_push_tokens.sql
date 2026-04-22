-- Migration 032: Push notification tokens for SM-2 daily reminders

CREATE TABLE push_tokens (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       text        NOT NULL,
  platform    text        NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  created_at  timestamptz DEFAULT now(),
  UNIQUE (user_id, token)
);

ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own tokens"
  ON push_tokens
  FOR ALL
  USING (user_id = auth.uid());

-- Index to speed up the edge-function fan-out query
CREATE INDEX idx_push_tokens_user ON push_tokens(user_id);
