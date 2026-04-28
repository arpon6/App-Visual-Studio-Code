-- SQL de migración para el proyecto Mi Club
-- Pega este script en el editor SQL del proyecto nuevo y ejecútalo.
-- IMPORTANTE: este script cubre solo las tablas de datos.
-- Auth (usuarios) y Storage (archivos) no se pueden migrar solo con SQL en el editor.

-- 1) Tablas de esquema
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null default 'coach',
  club text,
  created_at timestamptz default now()
);

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete set null,
  name text not null,
  number int,
  position text,
  birth_date date,
  height numeric(5,2),
  weight numeric(5,1),
  photo_url text,
  active boolean default true,
  created_at timestamptz default now()
);

create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  date timestamptz not null,
  competition text,
  venue text,
  opponent text not null,
  home boolean default true,
  status text default 'scheduled',
  score_for int default 0,
  score_against int default 0,
  report text,
  created_at timestamptz default now()
);

create table if not exists match_plans (
  id uuid primary key default gen_random_uuid(),
  match_id uuid references matches(id) on delete cascade,
  title text not null,
  description text,
  tactics jsonb,
  created_at timestamptz default now()
);

create table if not exists match_analysis (
  id uuid primary key default gen_random_uuid(),
  match_id uuid references matches(id) on delete cascade,
  summary text,
  strengths text,
  weaknesses text,
  lessons text,
  analysis_date timestamptz default now(),
  created_at timestamptz default now()
);

create table if not exists individual_development (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references players(id) on delete cascade,
  objective text not null,
  progress text,
  status text default 'active',
  start_date date,
  target_date date,
  created_at timestamptz default now()
);

create table if not exists player_statistics (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references players(id) on delete cascade,
  season text,
  games_played int default 0,
  goals int default 0,
  assists int default 0,
  minutes_played int default 0,
  yellow_cards int default 0,
  red_cards int default 0,
  created_at timestamptz default now()
);

create table if not exists standings (
  id uuid primary key default gen_random_uuid(),
  season text,
  competition text,
  position int,
  played int default 0,
  wins int default 0,
  draws int default 0,
  losses int default 0,
  points int default 0,
  goal_difference int default 0,
  updated_at timestamptz default now()
);

create table if not exists repository_resources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  category text,
  storage_path text,
  public_url text,
  resource_type text,
  created_at timestamptz default now()
);

create table if not exists other_information (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text,
  category text,
  created_at timestamptz default now()
);

-- 2) Inserta aquí los datos exportados de tus tablas antiguas
-- Si el proyecto antiguo te permite exportar datos como INSERTs o un dump SQL,
-- pega esos INSERTs aquí justo después de las definiciones de tablas.

-- Ejemplo de insert en profiles:
-- insert into profiles (id, full_name, role, club, created_at) values
--   ('11111111-1111-1111-1111-111111111111','Javier Sagrario','coach','Mi Club','2026-04-28T19:00:00Z');

-- Ejemplo de insert en players:
-- insert into players (id, profile_id, name, number, position, birth_date, height, weight, photo_url, active, created_at) values
--   ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','Jugador Ejemplo',10,'Delantero','2010-03-15',1.75,68,'https://.../foto.jpg',true,'2026-04-28T19:00:00Z');

-- Repite con todas tus tablas generadas en el proyecto origen.

-- 3) Auth / usuarios
-- No se puede importar la tabla auth.users directamente desde el editor SQL del proyecto nuevo.
-- Para migrar usuarios debes usar la CLI de Supabase o el API de administración.
-- Si quieres, te preparo los comandos exactos para exportar usuarios del proyecto antiguo y recrearlos en el proyecto nuevo.

-- 4) Storage / archivos
-- Storage no se migra con SQL en el editor.
-- Debes copiar los archivos de bucket a bucket usando:
--   - el panel de Storage de Supabase
--   - o la CLI de Supabase (supabase storage import/export)
--   - o una herramienta de descarga/subida manual.

-- 5) Notas adicionales
-- Si ya tienes un dump SQL del proyecto antiguo, simplemente pega el SQL completo aquí.
-- Si no tienes dump, exporta datos de cada tabla con INSERTs desde el proyecto origen.
-- Recuerda que las tablas de Auth y Storage son especiales y no dependen solo del SQL del editor.
