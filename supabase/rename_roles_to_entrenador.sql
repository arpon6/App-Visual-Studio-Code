-- ============================================================
-- MIGRACION DE ROLES
-- Renombra cuerpo_tecnico a entrenador y habilita nuevos roles:
-- preparador_fisico y directivo.
-- ============================================================

begin;

update app_users
set role = 'entrenador'
where role = 'cuerpo_tecnico';

alter table app_users
  drop constraint if exists app_users_role_check;

alter table app_users
  add constraint app_users_role_check
  check (role in ('jugador', 'entrenador', 'preparador_fisico', 'directivo', 'SUPER_ADMIN'));

drop policy if exists "allow_update_for_admin" on app_users;
create policy "allow_update_for_admin" on app_users
  for update using (
    (select role from app_users where id = auth.uid()) in ('entrenador', 'preparador_fisico', 'directivo', 'SUPER_ADMIN')
  );

commit;
