-- Supabase schema inicial para el proyecto Mi Club
-- Pega este SQL en el editor SQL del proyecto nuevo y ejecútalo.

-- Tabla de perfiles de usuario vinculada a Auth
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null default 'coach',
  club text,
  created_at timestamptz default now()
);

-- Jugadores de la plantilla
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

-- Partidos y calendario
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

-- Planes de partido
create table if not exists match_plans (
  id uuid primary key default gen_random_uuid(),
  match_id uuid references matches(id) on delete cascade,
  title text not null,
  description text,
  tactics jsonb,
  created_at timestamptz default now()
);

-- Análisis de partido
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

-- Desarrollo individual de jugadores
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

-- Estadísticas de jugadores
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

-- Clasificación / resultados
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

-- Repositorio ABP / recursos
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

-- Otras informaciones
create table if not exists other_information (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text,
  category text,
  created_at timestamptz default now()
);

-- Nota: Storage y Auth se gestionan desde el dashboard/Storage UI y Auth settings.
-- Si quieres, puedo añadir SQL RLS y políticas de seguridad para que solo los usuarios autenticados accedan a sus datos.
