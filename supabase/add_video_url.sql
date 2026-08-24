-- Agrega soporte de URL de vídeo (YouTube embebido) a partidos del calendario y de resultados.
-- Ejecutar una sola vez en Supabase SQL Editor.

alter table if exists calendar_events
  add column if not exists video_url text;

alter table if exists resultados_partidos
  add column if not exists video_url text;
