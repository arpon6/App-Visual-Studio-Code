-- Wellness RLS quick fix
begin;

alter table if exists wellness_responses enable row level security;

drop policy if exists jugador_select on wellness_responses;
drop policy if exists jugador_insert on wellness_responses;
drop policy if exists jugador_update on wellness_responses;
drop policy if exists jugador_delete on wellness_responses;

create policy jugador_select on wellness_responses
  for select
  using (auth.role() = 'authenticated');

create policy jugador_insert on wellness_responses
  for insert
  with check (auth.role() = 'authenticated');

create policy jugador_update on wellness_responses
  for update
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy jugador_delete on wellness_responses
  for delete
  using (auth.role() = 'authenticated');

commit;

-- Verify policies
select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'wellness_responses'
order by policyname;
