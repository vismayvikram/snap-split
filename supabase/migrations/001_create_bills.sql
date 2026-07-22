create table if not exists public.bills (
  share_id text primary key check (char_length(share_id) between 6 and 8),
  bill jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.bills enable row level security;

-- No public policies: bills are only read and written by the server using the
-- Supabase secret key. This prevents direct anonymous access to bill data.
