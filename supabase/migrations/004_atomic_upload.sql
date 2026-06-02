-- =====================================================
-- MIGRACIÓN 004: carga atómica de un período
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- =====================================================
--
-- Reemplaza el flujo "DELETE + INSERT por lotes" del frontend por una sola
-- transacción en el servidor. Si la inserción falla a mitad, el borrado de las
-- líneas anteriores se revierte automáticamente: nunca queda un período corrupto.
--
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
