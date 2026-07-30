-- Fix universal para móviles: player_id en text + unique por jugador/fecha/tipo
-- Ejecutar completo en Supabase SQL Editor

begin;

alter table if exists wellness_responses disable row level security;

alter table wellness_responses
  drop constraint if exists wellness_responses_player_id_fkey;

alter table wellness_responses
  alter column player_id type text
  using player_id::text;

alter table wellness_responses
  drop constraint if exists wellness_responses_player_id_event_date_key;

alter table wellness_responses
  drop constraint if exists wellness_responses_player_id_event_date_event_type_key;

alter table wellness_responses
  add constraint wellness_responses_player_id_event_date_event_type_key
  unique (player_id, event_date, event_type);

-- Permisos explicitos para clientes web/movil (login manual usa rol anon)
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on table wellness_responses to anon, authenticated;

commit;

-- Verificacion minima
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'wellness_responses'
  and column_name = 'player_id';

select conname, pg_get_constraintdef(c.oid) as definition
from pg_constraint c
join pg_class t on c.conrelid = t.oid
join pg_namespace n on t.relnamespace = n.oid
where n.nspname = 'public'
  and t.relname = 'wellness_responses'
  and conname = 'wellness_responses_player_id_event_date_event_type_key';

select relrowsecurity
from pg_class
where relname = 'wellness_responses';

select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'wellness_responses'
  and grantee in ('anon', 'authenticated')
order by grantee, privilege_type;
