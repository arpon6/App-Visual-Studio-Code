-- HARD FIX para que Wellness sincronice entre dispositivos
-- Ejecutar en Supabase SQL Editor

begin;

-- 1) Ajustar tipo de player_id a text para aceptar cualquier formato real
--    (uuid, bigint o string) y evitar rechazos por cast en dispositivos.
do $$
declare
  current_type text;
begin
  select data_type
    into current_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'wellness_responses'
    and column_name = 'player_id';

  if current_type is null then
    raise exception 'No existe la columna player_id en wellness_responses';
  end if;

  if current_type <> 'text' then
    alter table wellness_responses
      drop constraint if exists wellness_responses_player_id_fkey;

    -- Mantiene el valor actual en formato texto para no perder datos.
    alter table wellness_responses
      alter column player_id type text
      using player_id::text;
  end if;
end $$;

-- 2) Dejar una unica fila por jugador-fecha-tipo
alter table wellness_responses
  drop constraint if exists wellness_responses_player_id_event_date_key;

alter table wellness_responses
  drop constraint if exists wellness_responses_player_id_event_date_event_type_key;

alter table wellness_responses
  add constraint wellness_responses_player_id_event_date_event_type_key
  unique (player_id, event_date, event_type);

-- 3) Como la app usa login manual (sin sesión auth de Supabase), desactivar RLS en esta tabla
alter table wellness_responses disable row level security;

commit;

-- Verificacion
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'wellness_responses'
  and column_name in ('player_id', 'event_date', 'event_type')
order by column_name;

select conname, pg_get_constraintdef(c.oid) as definition
from pg_constraint c
join pg_class t on c.conrelid = t.oid
join pg_namespace n on t.relnamespace = n.oid
where n.nspname = 'public'
  and t.relname = 'wellness_responses'
  and conname like '%player_id%event_date%'
order by conname;

select relrowsecurity
from pg_class
where relname = 'wellness_responses';
