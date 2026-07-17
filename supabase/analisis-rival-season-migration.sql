-- Migracion opcional para separar el guardado de "Analisis del rival" por temporada.
--
-- Que hace:
-- 1) Define una temporada activa especifica para esta pagina en shared_state.
-- 2) Copia el estado actual legacy (analisis_rival_v1) a una clave estacional.
-- 3) Duplica las pizarras ABP legacy de cada rival a titulos estacionales en match_plans.
--
-- Si NO ejecutas este script, la pagina sigue funcionando con el guardado anterior.
-- Si SI lo ejecutas, la pagina empezara a leer/escribir por temporada y dejara intactos los datos legacy.

begin;

-- Ajusta este valor antes de ejecutar la migracion.
-- Temporada activa para Analisis del rival.
insert into shared_state (key, value, updated_at)
select
  'analisis_rival_active_season',
  to_jsonb(season_label),
  now()
from (
  select '2026-27'::text as season_label
) as target_season
on conflict (key) do update
set value = excluded.value,
    updated_at = excluded.updated_at;

-- Copia el estado general legacy a la nueva clave estacional.
insert into shared_state (key, value, updated_at)
select
  'analisis_rival_v1__' || lower(regexp_replace(season_label, '[^a-zA-Z0-9]+', '_', 'g')),
  legacy.value,
  now()
from (
  select '2026-27'::text as season_label
) as target_season
join shared_state as legacy
  on legacy.key = 'analisis_rival_v1'
on conflict (key) do update
set value = excluded.value,
    updated_at = excluded.updated_at;

-- Duplica las ABP legacy de rivales a titulos estacionales.
-- Legacy esperado:
--   rival_<equipo>_abp_ofensivo
--   rival_<equipo>_abp_defensivo
-- Nuevo formato:
--   rival_<temporada>_<equipo>_abp_ofensivo
--   rival_<temporada>_<equipo>_abp_defensivo
insert into match_plans (title, description, tactics, created_at)
select
  regexp_replace(
    mp.title,
    '^rival_',
    'rival_' || lower(regexp_replace(ts.season_label, '[^a-zA-Z0-9]+', '_', 'g')) || '_'
  ) as title,
  mp.description,
  mp.tactics,
  now()
from match_plans as mp
cross join (
  select '2026-27'::text as season_label
) as ts
where mp.title ~ '^rival_[a-z0-9_]+_abp_(ofensivo|defensivo)$'
  and mp.title not like 'rival_' || lower(regexp_replace(ts.season_label, '[^a-zA-Z0-9]+', '_', 'g')) || '_%'
  and not exists (
    select 1
    from match_plans as existing
    where existing.title = regexp_replace(
      mp.title,
      '^rival_',
      'rival_' || lower(regexp_replace(ts.season_label, '[^a-zA-Z0-9]+', '_', 'g')) || '_'
    )
  );

commit;

-- Nota:
-- Verificacion rapida despues de ejecutar:
--   select key from shared_state where key like 'analisis_rival%';
--   select title from match_plans where title like 'rival_%abp_%' order by title;