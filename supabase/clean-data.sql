-- =====================================================
-- Limpieza de datos de consumo (sin afectar usuarios)
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- =====================================================

-- 1. Eliminar líneas de consumo (se eliminan en cascada con períodos,
--    pero lo hacemos explícito por claridad)
DELETE FROM public.consumption_lines;

-- 2. Eliminar períodos
DELETE FROM public.periods;

-- 3. (Opcional) Eliminar sucursales y sus asignaciones
-- Descomentar si también se quieren limpiar las sucursales:
-- DELETE FROM public.user_branches;
-- DELETE FROM public.branches;
