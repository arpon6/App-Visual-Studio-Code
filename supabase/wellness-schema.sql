create table if not exists wellness_responses (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references plantilla(id) on delete cascade,
  event_date date not null,
  event_type text not null, -- 'entrenamiento' | 'partido'
  rpe integer not null check (rpe between 1 and 10),
  animo integer not null check (animo between 1 and 10),
  fisico integer not null check (fisico between 1 and 10),
  molestias text,
  created_at timestamptz default now(),
  unique(player_id, event_date)
);

alter table wellness_responses enable row level security;

-- Jugadores solo ven/insertan sus propias respuestas
create policy "jugador_insert" on wellness_responses
  for insert with check (true);

create policy "jugador_select" on wellness_responses
  for select using (true);

create policy "jugador_update" on wellness_responses
  for update using (true);
