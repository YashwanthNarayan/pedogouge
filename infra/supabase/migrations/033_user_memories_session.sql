-- Migration 033: Extend user_memories for per-session Haiku summaries
-- Adds session_id, memory_text, model columns alongside existing key/value_json columns.

ALTER TABLE user_memories
  ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS memory_text text,
  ADD COLUMN IF NOT EXISTS model text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- Unique constraint so ON CONFLICT (session_id) works in upserts
CREATE UNIQUE INDEX IF NOT EXISTS user_memories_session_unique
  ON user_memories (session_id)
  WHERE session_id IS NOT NULL;
