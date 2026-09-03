-- Impide guardar respuestas wellness fuera de la ventana de su actividad.
-- Ejecutar una sola vez en Supabase SQL Editor.

create or replace function public.check_wellness_response_window()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  local_now timestamp := timezone('Europe/Madrid', now());
  training_start timestamp;
  next_activity_date date;
begin
  if new.event_type = 'pre_entrenamiento' then
    select to_timestamp(
      ce.date || ' ' || coalesce(nullif(ce.time, ''), '23:59'),
      'DD/MM/YYYY HH24:MI'
    ) at time zone 'Europe/Madrid'
    into training_start
    from calendar_events ce
    where ce.type = 'entrenamiento'
      and ce.date = to_char(new.event_date, 'DD/MM/YYYY')
    order by to_timestamp(
      ce.date || ' ' || coalesce(nullif(ce.time, ''), '23:59'),
      'DD/MM/YYYY HH24:MI'
    )
    limit 1;

    if training_start is null or local_now < new.event_date::timestamp or local_now >= training_start then
      raise exception 'El PRE entrenamiento ya no admite respuestas fuera de su ventana';
    end if;
  elsif new.event_type = 'post_entrenamiento' then
    select min(to_date(ce.date, 'DD/MM/YYYY'))
    into next_activity_date
    from calendar_events ce
    where ce.type in ('entrenamiento', 'partido')
      and to_date(ce.date, 'DD/MM/YYYY') > new.event_date;

    if next_activity_date is not null and local_now >= next_activity_date::timestamp then
      raise exception 'El POST entrenamiento ya no admite respuestas: ha comenzado el siguiente cuestionario';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists wellness_response_window on wellness_responses;

create trigger wellness_response_window
before insert or update on wellness_responses
for each row execute function public.check_wellness_response_window();