-- =====================================================
-- SCHEMA: Consumo Móvil Dashboard
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- =====================================================

-- 1. SUCURSALES
CREATE TABLE public.branches (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 2. PERÍODOS (un registro por mes cargado)
CREATE TABLE public.periods (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  year         INT NOT NULL CHECK (year BETWEEN 2020 AND 2100),
  month        INT NOT NULL CHECK (month BETWEEN 1 AND 12),
  uploaded_at  TIMESTAMPTZ DEFAULT NOW(),
  uploaded_by  UUID REFERENCES auth.users(id),
  UNIQUE(year, month)
);

-- 3. LÍNEAS DE CONSUMO
CREATE TABLE public.consumption_lines (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  period_id   UUID NOT NULL REFERENCES public.periods(id) ON DELETE CASCADE,
  branch_id   UUID REFERENCES public.branches(id),
  linea       TEXT NOT NULL,
  alias       TEXT,
  plan        TEXT,
  desc_plan   TEXT,
  datos_mb    FLOAT  DEFAULT 0,
  voz_min     INT    DEFAULT 0,
  sms_count   INT    DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 4. PERFILES DE USUARIO (extiende auth.users)
CREATE TABLE public.profiles (
  id            UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'viewer')) DEFAULT 'viewer',
  branch_id     UUID REFERENCES public.branches(id),
  display_name  TEXT
);

-- 5. TRIGGER: crear perfil automáticamente al registrar usuario
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, role)
  VALUES (NEW.id, 'viewer')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE public.branches         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.periods          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consumption_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles         ENABLE ROW LEVEL SECURITY;

-- BRANCHES: todos leen, solo admin escribe
CREATE POLICY "branches_select" ON public.branches
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "branches_admin_all" ON public.branches
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- PERIODS: todos leen, solo admin escribe
CREATE POLICY "periods_select" ON public.periods
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "periods_admin_all" ON public.periods
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- CONSUMPTION_LINES: admin ve todo, viewer solo su sucursal
CREATE POLICY "lines_admin_all" ON public.consumption_lines
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "lines_viewer_own_branch" ON public.consumption_lines
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role = 'viewer'
        AND branch_id = consumption_lines.branch_id
    )
  );

-- PROFILES: cada usuario ve el suyo, admin ve todos
CREATE POLICY "profiles_own_select" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "profiles_admin_all" ON public.profiles
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- =====================================================
-- ÍNDICES (performance)
-- =====================================================

CREATE INDEX idx_lines_period    ON public.consumption_lines(period_id);
CREATE INDEX idx_lines_branch    ON public.consumption_lines(branch_id);
CREATE INDEX idx_periods_year_month ON public.periods(year, month);

-- =====================================================
-- DATOS INICIALES: crear usuario administrador
-- (reemplazar con email/password reales antes de ejecutar)
-- Alternativa: crear desde Supabase Dashboard → Authentication → Users
-- =====================================================
-- SELECT supabase_auth.create_user('admin@tuempresa.com', 'password_seguro', true);
-- UPDATE public.profiles SET role = 'admin' WHERE id = (
--   SELECT id FROM auth.users WHERE email = 'admin@tuempresa.com'
-- );
