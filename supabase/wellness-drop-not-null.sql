-- Fix rapido: permitir NULL en columnas wellness PRE/POST
-- Ejecutar en Supabase SQL Editor

alter table wellness_responses
  alter column rpe drop not null,
  alter column animo drop not null,
  alter column fisico drop not null;

-- Verificacion
select column_name, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'wellness_responses'
  and column_name in ('rpe', 'animo', 'fisico')
order by column_name;
