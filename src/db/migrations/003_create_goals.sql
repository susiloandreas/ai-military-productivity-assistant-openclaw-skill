CREATE TABLE IF NOT EXISTS goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  habit_category_id UUID NOT NULL REFERENCES habit_categories(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  target_description TEXT,
  deadline DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'achieved', 'missed', 'paused')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
