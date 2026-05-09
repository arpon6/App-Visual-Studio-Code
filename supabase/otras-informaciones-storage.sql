-- Bucket para documentos de Otras Informaciones
insert into storage.buckets (id, name, public)
values ('documentos', 'documentos', true)
on conflict (id) do nothing;

-- Política: cualquiera puede leer (público)
create policy "Documentos públicos lectura"
  on storage.objects for select
  using (bucket_id = 'documentos');

-- Política: usuarios autenticados pueden subir
create policy "Documentos subida autenticados"
  on storage.objects for insert
  with check (bucket_id = 'documentos');

-- Política: usuarios autenticados pueden eliminar
create policy "Documentos eliminar autenticados"
  on storage.objects for delete
  using (bucket_id = 'documentos');

-- Añadir columna storage_path a other_information si no existe
alter table other_information
  add column if not exists storage_path text,
  add column if not exists file_name text,
  add column if not exists public_url text;
