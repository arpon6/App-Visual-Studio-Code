-- Borrar políticas existentes para recrearlas
drop policy if exists "Autenticados pueden ver eventos" on calendar_events;
drop policy if exists "Autenticados pueden insertar eventos" on calendar_events;
drop policy if exists "Autenticados pueden actualizar sus eventos" on calendar_events;
drop policy if exists "Autenticados pueden borrar eventos" on calendar_events;

-- Política de lectura: Todos los usuarios autenticados pueden ver los eventos
create policy "Autenticados pueden ver eventos"
  on calendar_events for select
  using (auth.role() = 'authenticated');

-- Política de inserción: Permitir que cualquier usuario autenticado inserte
-- usando 'with check (true)' permite que la fila se inserte si el usuario está autenticado
create policy "Autenticados pueden insertar eventos"
  on calendar_events for insert
  with check (auth.role() = 'authenticated');

-- Política de actualización: Permitir actualización
create policy "Autenticados pueden actualizar sus eventos"
  on calendar_events for update
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- Política de borrado
create policy "Autenticados pueden borrar eventos"
  on calendar_events for delete
  using (auth.role() = 'authenticated');
