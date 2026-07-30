-- CHECK rapido de sincronizacion entre dispositivos
-- 1) Ejecuta esto antes de guardar desde el movil
-- 2) Guarda un PRE/POST en el movil
-- 3) Ejecuta otra vez y compara

select now() as server_time;

select
  count(*) as total_rows,
  max(created_at) as last_created_at
from wellness_responses;

select
  id,
  player_id,
  event_date,
  event_type,
  rpe,
  animo,
  fisico,
  left(coalesce(molestias, ''), 120) as molestias_preview,
  created_at
from wellness_responses
order by created_at desc
limit 20;

select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'wellness_responses'
  and grantee in ('anon', 'authenticated')
order by grantee, privilege_type;
