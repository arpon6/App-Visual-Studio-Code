-- Tabla de partidos/resultados
create table if not exists resultados_partidos (
  id uuid primary key default gen_random_uuid(),
  jornada int not null,
  fecha date not null,
  equipo_local text not null,
  siglas_local text not null default 'AR',
  goles_local int not null default 0,
  goles_visitante int not null default 0,
  equipo_visitante text not null,
  siglas_visitante text not null default 'AR',
  competicion text,
  acta_url text,
  created_at timestamptz default now()
);

-- Tabla de clasificación
create table if not exists clasificacion (
  id uuid primary key default gen_random_uuid(),
  temporada text not null default '2023-24',
  posicion int not null,
  equipo text not null,
  es_mi_equipo boolean default false,
  pj int default 0,
  g int default 0,
  e int default 0,
  p int default 0,
  gf int default 0,
  gc int default 0,
  pts int default 0,
  updated_at timestamptz default now()
);

alter table resultados_partidos enable row level security;
alter table clasificacion enable row level security;
create policy "Acceso público resultados" on resultados_partidos for all using (true);
create policy "Acceso público clasificacion" on clasificacion for all using (true);
