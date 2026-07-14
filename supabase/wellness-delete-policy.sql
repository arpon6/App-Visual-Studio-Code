alter table wellness_responses enable row level security;

drop policy if exists "jugador_delete" on wellness_responses;

create policy "jugador_delete" on wellness_responses
  for delete using (true);