-- Run this in your Supabase SQL Editor (one-time update)
-- Adds persistent settings storage keyed by a browser device ID

create table if not exists user_settings (
  device_id text primary key,
  settings_json jsonb not null default '{}',
  updated_at timestamptz default now()
);

alter table user_settings enable row level security;

create policy "Allow all on user_settings"
  on user_settings for all
  using (true)
  with check (true);
