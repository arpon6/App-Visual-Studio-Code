-- Añadir columnas para datos de partido
alter table calendar_events add column if not exists rival text;
alter table calendar_events add column if not exists jornada text;
alter table calendar_events add column if not exists match_type text;
