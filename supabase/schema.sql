create table if not exists public.app_users (
  id text primary key,
  id_normalized text not null unique,
  name text not null,
  password_hash text not null check (
    password_hash ~ '^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$'
  ),
  active boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.quote_orders (
  request_id uuid primary key,
  record jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.quote_mail_previews (
  request_id uuid primary key references public.quote_orders(request_id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.quote_mail_deliveries (
  request_id uuid primary key references public.quote_orders(request_id) on delete cascade,
  recipient text not null,
  fingerprint text not null,
  status text not null check (status in ('sending', 'sent', 'failed', 'uncertain')),
  attempts integer not null check (attempts > 0),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  sent_at timestamptz,
  message_id text,
  retryable boolean not null default false,
  error_code text,
  error_command text
);

alter table public.app_users enable row level security;
alter table public.quote_orders enable row level security;
alter table public.quote_mail_previews enable row level security;
alter table public.quote_mail_deliveries enable row level security;

revoke all on public.app_users from anon, authenticated;
revoke all on public.quote_orders from anon, authenticated;
revoke all on public.quote_mail_previews from anon, authenticated;
revoke all on public.quote_mail_deliveries from anon, authenticated;

grant all on public.app_users to service_role;
grant all on public.quote_orders to service_role;
grant all on public.quote_mail_previews to service_role;
grant all on public.quote_mail_deliveries to service_role;
