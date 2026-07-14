-- Registro de envios de recordatorios de cumpleanos para evitar duplicados.
create table if not exists birthday_email_notifications (
  notification_date date primary key,
  sent_at timestamptz,
  admins_count integer default 0,
  birthdays_count integer default 0,
  status text,
  error_message text,
  payload jsonb,
  created_at timestamptz default now()
);

-- Recomendado: mantener RLS desactivado para uso interno con service_role.
alter table birthday_email_notifications disable row level security;
