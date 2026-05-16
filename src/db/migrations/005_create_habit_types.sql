CREATE TABLE IF NOT EXISTS habit_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  habit_category_id UUID NOT NULL REFERENCES habit_categories(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  unit VARCHAR(50) NOT NULL DEFAULT 'minutes',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(habit_category_id, name)
);
