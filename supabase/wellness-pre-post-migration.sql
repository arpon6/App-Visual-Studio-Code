alter table wellness_responses
  alter column rpe drop not null,
  alter column animo drop not null,
  alter column fisico drop not null;

alter table wellness_responses
  drop constraint if exists wellness_responses_player_id_event_date_key;

alter table wellness_responses
  add constraint wellness_responses_player_id_event_date_event_type_key
  unique (player_id, event_date, event_type);
