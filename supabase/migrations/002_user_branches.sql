-- Tabla many-to-many: un usuario puede ver múltiples sucursales
CREATE TABLE IF NOT EXISTS user_branches (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  branch_id  uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, branch_id)
);

-- RLS
ALTER TABLE user_branches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access on user_branches"
  ON user_branches FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Users can read own branches"
  ON user_branches FOR SELECT
  USING (user_id = auth.uid());

-- Migrar datos existentes: copiar branch_id de profiles a user_branches
INSERT INTO user_branches (user_id, branch_id)
SELECT id, branch_id FROM profiles
WHERE branch_id IS NOT NULL
ON CONFLICT DO NOTHING;
