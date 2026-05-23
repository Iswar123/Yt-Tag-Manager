-- ============================================
-- Iswar YouTube Helper — Supabase SQL Schema
-- Supabase dashboard → SQL Editor mein run karo
-- ============================================

create table public.user_credentials (
  id               uuid default gen_random_uuid() primary key,
  user_id          uuid references auth.users(id) on delete cascade not null unique,
  channel_id       text,
  yt_client_id     text,
  yt_client_secret text,
  yt_refresh_token text,
  ai_provider      text default 'openrouter',
  ai_api_key       text,
  updated_at       timestamp with time zone default now()
);

-- Row Level Security — har user sirf apna data dekhe
alter table public.user_credentials enable row level security;

create policy "Users can manage own credentials"
  on public.user_credentials
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
