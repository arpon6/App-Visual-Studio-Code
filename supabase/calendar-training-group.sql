-- Agrega soporte de grupo (G1-G4) por dia de entrenamiento en calendar_events.
-- Ejecutar una sola vez en Supabase SQL Editor.

alter table if exists calendar_events
  add column if not exists training_group text;

-- Restriccion opcional para evitar valores fuera de G1-G4 (permitiendo null).
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'calendar_events_training_group_check'
  ) then
    alter table calendar_events
      add constraint calendar_events_training_group_check
      check (training_group is null or training_group in ('G1', 'G2', 'G3', 'G4'));
  end if;
end $$;
