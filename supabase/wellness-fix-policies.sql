-- Reparacion de politicas RLS para wellness_responses
-- Ejecutar en el SQL Editor de Supabase

alter table if exists wellness_responses enable row level security;

drop policy if exists "jugador_select" on wellness_responses;
drop policy if exists "jugador_insert" on wellness_responses;
drop policy if exists "jugador_update" on wellness_responses;
drop policy if exists "jugador_delete" on wellness_responses;

create policy "jugador_select" on wellness_responses
  for select
  using (auth.role() = 'authenticated');

create policy "jugador_insert" on wellness_responses
  for insert
  with check (auth.role() = 'authenticated');

create policy "jugador_update" on wellness_responses
  for update
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "jugador_delete" on wellness_responses
  for delete
  using (auth.role() = 'authenticated');
