-- ============================================================================
-- FIX: shared_state inaccesible por RLS
-- ----------------------------------------------------------------------------
-- Causa: la app usa login propio (tabla app_users) y NUNCA crea sesion de
-- Supabase Auth. Las politicas antiguas exigian auth.role() = 'authenticated',
-- por lo que todas las lecturas/escrituras en shared_state eran rechazadas:
-- lo que escribia un entrenador (p.ej. Rojas) nunca se guardaba ni se veia
-- por el resto (entrenadores y jugadores).
--
-- Solucion: permitir acceso a la clave anon/publica, igual que ya hacen
-- actas_partidos, resultados_partidos y otras tablas compartidas del club.
--
-- EJECUTAR EN: Supabase Dashboard -> SQL Editor
-- ============================================================================

-- 1) Eliminar politicas antiguas que bloqueaban a la clave anonima
drop policy if exists "Autenticados leen shared_state" on shared_state;
drop policy if exists "Autenticados escriben shared_state" on shared_state;
drop policy if exists "Autenticados actualizan shared_state" on shared_state;

-- 2) Crear politicas abiertas (mismo criterio que el resto de tablas del club)
create policy "shared_state_select" on shared_state for select using (true);
create policy "shared_state_insert" on shared_state for insert with check (true);
create policy "shared_state_update" on shared_state for update using (true) with check (true);

-- 3) Asegurar que RLS sigue activo pero permisivo (defensa en profundidad)
alter table shared_state enable row level security;

-- 4) Habilitar realtime para que los cambios lleguen sin refrescar
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'shared_state'
  ) then
    alter publication supabase_realtime add table shared_state;
  end if;
end $$;
