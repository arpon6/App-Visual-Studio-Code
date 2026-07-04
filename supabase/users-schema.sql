-- ============================================================
-- SISTEMA DE USUARIOS
-- Ejecutar en el editor SQL de Supabase
-- ============================================================

-- 1. Lista blanca de correos permitidos (gestionada por el admin)
create table if not exists allowed_emails (
  email text primary key,
  created_at timestamptz default now()
);

-- 2. Usuarios de la app vinculados a auth.users
create table if not exists app_users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  username text,
  password text,
  role text not null check (role in ('jugador', 'entrenador', 'preparador_fisico', 'directivo', 'SUPER_ADMIN')),
  -- Si role = 'jugador', se vincula a un registro de la tabla plantilla
  player_id bigint references plantilla(id) on delete set null,
  created_at timestamptz default now()
);

-- 3. Columna en los cortes de vídeo para asignar a jugador o plantilla completa
-- Añadir a la tabla de cortes si existe, o usar como referencia para el schema
-- player_id = null  → asignado a toda la plantilla
-- player_id = uuid  → asignado a un jugador concreto

-- ============================================================
-- RLS (Row Level Security)
-- ============================================================

alter table allowed_emails enable row level security;
alter table app_users enable row level security;

-- Solo usuarios autenticados pueden leer allowed_emails (para validar su propio correo)
create policy "allowed_emails_read" on allowed_emails
  for select using (auth.role() = 'authenticated');

-- Cada usuario solo puede leer su propio registro en app_users
drop policy if exists "app_users_read_own" on app_users;
create policy "app_users_read_own" on app_users
  for select using (auth.uid() = id);

-- Política para permitir que cualquiera pueda hacer SELECT (necesaria para el login manual)
drop policy if exists "allow_select_for_everyone" on app_users;
create policy "allow_select_for_everyone" on app_users
  for select using (true);

-- Política para que solo administradores puedan actualizar
drop policy if exists "allow_update_for_admin" on app_users;
create policy "allow_update_for_admin" on app_users
  for update using (
    (select role from app_users where id = auth.uid()) in ('entrenador', 'preparador_fisico', 'directivo', 'SUPER_ADMIN')
  );

-- Solo service_role puede insertar/actualizar app_users (el admin lo hace desde el dashboard)
-- Para permitir que el trigger lo inserte automáticamente, usamos una función con security definer

-- ============================================================
-- FUNCIÓN: crear app_user al registrarse si el email está permitido
-- ============================================================
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  -- Solo crear registro si el email está en la lista blanca
  if exists (select 1 from allowed_emails where email = new.email) then
    insert into app_users (id, email, role)
    values (new.id, new.email, 'jugador')
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;

-- Trigger que se ejecuta al crear un nuevo usuario en auth
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
