-- ============================================================
-- ACTUALIZACION DE ROLES POR USUARIO
-- Requisito:
-- - Edu => directivo
-- - Valle => preparador_fisico
-- - German => preparador_fisico
-- ============================================================

begin;

update app_users
set role = case
  when lower(username) = 'edu' then 'directivo'
  when lower(username) in ('valle', 'german') then 'preparador_fisico'
  else role
end
where lower(username) in ('edu', 'valle', 'german');

commit;

-- Verificacion
select username, role
from app_users
where lower(username) in ('edu', 'valle', 'german')
order by username;
