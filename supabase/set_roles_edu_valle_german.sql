-- ============================================================
-- ACTUALIZACION DE ROLES POR USUARIO
-- Requisito:
-- - Edu => directivo
-- - Valle => preparador_fisico
-- - German => preparador_fisico
-- ============================================================

begin;

-- Asegura que la restriccion de roles permite los nuevos valores.
alter table app_users
  drop constraint if exists app_users_role_check;

update app_users
set role = 'entrenador'
where role = 'cuerpo_tecnico';

alter table app_users
  add constraint app_users_role_check
  check (role in ('jugador', 'entrenador', 'preparador_fisico', 'directivo', 'SUPER_ADMIN'));

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
