-- Tabla para estado compartido entre cuerpo técnico
create table if not exists shared_state (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz default now()
);

-- Política de lectura para autenticados
create policy "Autenticados leen shared_state"
  on shared_state for select
  using (auth.role() = 'authenticated');

-- Política de escritura para autenticados
create policy "Autenticados escriben shared_state"
  on shared_state for insert
  with check (auth.role() = 'authenticated');

-- Política de actualización para autenticados
create policy "Autenticados actualizan shared_state"
  on shared_state for update
  using (auth.role() = 'authenticated');
