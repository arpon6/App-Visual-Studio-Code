-- Políticas RLS para la tabla calendar_events
-- Asegúrate de que la tabla exista. Si no, créala primero.

create table if not exists calendar_events (
  id text primary key,
  date text not null,
  type text not null,
  custom_type text,
  place text not null,
  time text,
  description text,
  pdf_name text,
  pdf_url text,
  created_by uuid references auth.users(id)
);

-- Habilitar RLS
alter table calendar_events enable row level security;

-- Política de lectura: Todos los usuarios autenticados pueden ver los eventos
create policy "Autenticados pueden ver eventos"
  on calendar_events for select
  using (auth.role() = 'authenticated');

-- Política de inserción: Solo usuarios autenticados pueden insertar
create policy "Autenticados pueden insertar eventos"
  on calendar_events for insert
  with check (auth.role() = 'authenticated');

-- Política de actualización: Solo el creador (o coach) puede actualizar
create policy "Autenticados pueden actualizar sus eventos"
  on calendar_events for update
  using (auth.role() = 'authenticated');

-- Política de borrado: Solo el creador (o coach) puede borrar
create policy "Autenticados pueden borrar eventos"
  on calendar_events for delete
  using (auth.role() = 'authenticated');
