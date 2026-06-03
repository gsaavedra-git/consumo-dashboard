-- =====================================================
-- MIGRACIÓN COMPLETA: Consumo Móvil Dashboard
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- -----------------------------------------------------
-- Este único archivo deja la base lista desde cero:
--   1. Tablas + trigger de perfil
--   2. Row Level Security
--   3. Índices
--   4. Storage (bucket de logos)
--   5. Función de carga atómica (replace_period_lines)
-- =====================================================

-- =====================================================
-- 1. TABLAS
-- =====================================================

-- 1.1 SUCURSALES
CREATE TABLE public.branches (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  logo_url    TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 1.2 PERÍODOS (un registro por mes cargado)
CREATE TABLE public.periods (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  year         INT NOT NULL CHECK (year BETWEEN 2020 AND 2100),
  month        INT NOT NULL CHECK (month BETWEEN 1 AND 12),
  uploaded_at  TIMESTAMPTZ DEFAULT NOW(),
  uploaded_by  UUID REFERENCES auth.users(id),
  UNIQUE(year, month)
);

-- 1.3 LÍNEAS DE CONSUMO
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

-- 1.4 PERFILES DE USUARIO (extiende auth.users)
CREATE TABLE public.profiles (
  id            UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'viewer')) DEFAULT 'viewer',
  display_name  TEXT
);

-- 1.5 RELACIÓN USUARIO-SUCURSALES (multi-branch para viewers)
CREATE TABLE public.user_branches (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  branch_id  UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  UNIQUE(user_id, branch_id)
);

-- 1.6 TRIGGER: crear perfil automáticamente al registrar usuario
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
-- 2. ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE public.branches          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.periods           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consumption_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_branches     ENABLE ROW LEVEL SECURITY;

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

-- CONSUMPTION_LINES: admin ve todo, viewer solo sus sucursales asignadas
CREATE POLICY "lines_admin_all" ON public.consumption_lines
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "lines_viewer_own_branches" ON public.consumption_lines
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.user_branches
      WHERE user_id = auth.uid()
        AND branch_id = consumption_lines.branch_id
    )
  );

-- USER_BRANCHES: cada usuario ve las suyas, admin gestiona todas
CREATE POLICY "user_branches_own_select" ON public.user_branches
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "user_branches_admin_all" ON public.user_branches
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- PROFILES: cada usuario ve el suyo, admin ve todos
CREATE POLICY "profiles_own_select" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "profiles_admin_all" ON public.profiles
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- =====================================================
-- 3. ÍNDICES (performance)
-- =====================================================

CREATE INDEX idx_lines_period       ON public.consumption_lines(period_id);
CREATE INDEX idx_lines_branch       ON public.consumption_lines(branch_id);
CREATE INDEX idx_periods_year_month ON public.periods(year, month);
CREATE INDEX idx_user_branches_user ON public.user_branches(user_id);

-- =====================================================
-- 4. STORAGE: bucket para logos de sucursales
-- =====================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('branch-logos', 'branch-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Subir / actualizar / borrar: usuarios autenticados
CREATE POLICY "Authenticated users can upload branch logos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'branch-logos');

CREATE POLICY "Authenticated users can update branch logos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'branch-logos');

CREATE POLICY "Authenticated users can delete branch logos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'branch-logos');

-- Lectura pública de los logos
CREATE POLICY "Public read access for branch logos"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'branch-logos');

-- =====================================================
-- 5. CARGA ATÓMICA DE UN PERÍODO
-- -----------------------------------------------------
-- Reemplaza el flujo "DELETE + INSERT por lotes" del frontend por una sola
-- transacción en el servidor. Si la inserción falla a mitad, el borrado de las
-- líneas anteriores se revierte automáticamente: nunca queda un período corrupto.
-- Las sucursales se resuelven en el frontend (idempotente) y se envían ya con
-- su branch_id en el JSON.
-- =====================================================

CREATE OR REPLACE FUNCTION public.replace_period_lines(
  p_year  INT,
  p_month INT,
  p_lines JSONB
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_id UUID;
  v_inserted  INTEGER;
BEGIN
  -- Solo administradores (SECURITY DEFINER salta RLS, así que validamos aquí).
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'No autorizado: se requiere rol admin';
  END IF;

  -- Crear o reutilizar el período (atómico con el resto).
  INSERT INTO public.periods (year, month, uploaded_by)
  VALUES (p_year, p_month, auth.uid())
  ON CONFLICT (year, month)
    DO UPDATE SET uploaded_at = NOW(), uploaded_by = auth.uid()
  RETURNING id INTO v_period_id;

  -- Reemplazar líneas: borrar las anteriores e insertar las nuevas.
  DELETE FROM public.consumption_lines WHERE period_id = v_period_id;

  INSERT INTO public.consumption_lines
    (period_id, branch_id, linea, alias, plan, desc_plan, datos_mb, voz_min, sms_count)
  SELECT
    v_period_id,
    NULLIF(elem->>'branch_id', '')::UUID,
    elem->>'linea',
    NULLIF(elem->>'alias', ''),
    NULLIF(elem->>'plan', ''),
    NULLIF(elem->>'desc_plan', ''),
    COALESCE((elem->>'datos_mb')::FLOAT, 0),
    COALESCE((elem->>'voz_min')::INT, 0),
    COALESCE((elem->>'sms_count')::INT, 0)
  FROM jsonb_array_elements(p_lines) AS elem;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

-- Permitir que los usuarios autenticados llamen la función (la autorización fina
-- de admin se valida dentro del cuerpo).
GRANT EXECUTE ON FUNCTION public.replace_period_lines(INT, INT, JSONB) TO authenticated;

-- =====================================================
-- 6. DATOS INICIALES: crear usuario administrador
-- (alternativa: Supabase Dashboard → Authentication → Users)
-- =====================================================
-- Tras crear el usuario en Authentication, promuévelo a admin:
-- UPDATE public.profiles SET role = 'admin' WHERE id = (
--   SELECT id FROM auth.users WHERE email = 'admin@tuempresa.com'
-- );
