-- Tabla para cabecera del acta de cada partido
create table if not exists actas_partidos (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  rival text not null,
  resultado text,
  competicion text,
  created_at timestamptz default now()
);

-- Tabla para las estadísticas por jugador de cada acta
create table if not exists estadisticas_actas (
  id uuid primary key default gen_random_uuid(),
  acta_id uuid references actas_partidos(id) on delete cascade,
  dorsal int not null,
  nombre text not null,
  titular boolean default false,
  goles int default 0,
  tarjetas int default 0,
  minutos int default 0,
  created_at timestamptz default now()
);

-- Si ya tienes la tabla creada, añade la columna con:
-- alter table estadisticas_actas add column if not exists minutos int default 0;

-- Políticas RLS (ajusta según tu configuración de auth)
alter table actas_partidos enable row level security;
alter table estadisticas_actas enable row level security;

create policy "Acceso público actas" on actas_partidos for all using (true);
create policy "Acceso público estadisticas_actas" on estadisticas_actas for all using (true);
