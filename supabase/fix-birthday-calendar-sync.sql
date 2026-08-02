-- Corrige fecha de nacimiento del jugador id 440 y limpia cumpleaños legacy en calendar_events.
-- Ejecutar en Supabase SQL Editor.

begin;

-- 1) Verificacion previa del jugador.
select id, first_name, last_name1, last_name2, birth_date
from plantilla
where id = 440;

-- 2) Actualizacion de fecha de nacimiento correcta (8 de mayo de 2004).
update plantilla
set birth_date = '2004-05-08'
where id = 440
  and first_name = 'Iván'
  and last_name1 = 'Munilla'
  and last_name2 = 'Monreal';

-- 3) Limpieza de cumpleaños guardados manualmente/legacy en calendar_events.
-- El calendario los reconstruye automaticamente desde plantilla.
delete from calendar_events
where lower(translate(type, 'áéíóúÁÉÍÓÚ', 'aeiouAEIOU')) = 'cumpleanos';

-- 4) Comprobacion final del jugador.
select id, first_name, last_name1, last_name2, birth_date
from plantilla
where id = 440;

commit;
