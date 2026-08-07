-- Crear la tabla calendar_events si no existe, pero asegurando el tipo de ID
-- Como la tabla parece existir ya pero con un tipo de dato erróneo en el ID,
-- debemos intentar corregirla.

-- Si la tabla ya existe y tiene el ID como texto o numero, primero hay que tratar de convertirla.
-- PRECAUCIÓN: Esto borrará datos si ya existen en la tabla.

drop table if exists calendar_events;

create table if not exists calendar_events (
  id uuid primary key default gen_random_uuid(),
  date text not null,
  type text not null,
  custom_type text,
  training_group text,
  place text not null,
  time text,
  description text,
  pdf_name text,
  pdf_url text,
  created_by uuid references auth.users(id)
);

-- Habilitar RLS
alter table calendar_events enable row level security;

-- Política de acceso total para autenticados
create policy "Acceso total para autenticados"
on calendar_events
for all
to authenticated
using (true)
with check (true);
