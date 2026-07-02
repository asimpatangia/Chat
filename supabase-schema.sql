-- Run this in your Supabase SQL Editor

-- Conversations table
create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'New Chat',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Messages table
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  created_at timestamptz default now()
);

-- Uploaded files table
create table if not exists uploaded_files (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete set null,
  name text not null,
  storage_path text not null,
  public_url text not null,
  size integer not null,
  mime_type text not null,
  created_at timestamptz default now()
);

-- Auto-update updated_at on conversations
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger conversations_updated_at
  before update on conversations
  for each row execute function update_updated_at();

-- Enable RLS (Row Level Security) — open policies for single-user app
alter table conversations enable row level security;
alter table messages enable row level security;
alter table uploaded_files enable row level security;

create policy "Allow all on conversations" on conversations for all using (true) with check (true);
create policy "Allow all on messages" on messages for all using (true) with check (true);
create policy "Allow all on uploaded_files" on uploaded_files for all using (true) with check (true);

-- Storage bucket for file uploads
insert into storage.buckets (id, name, public) values ('uploads', 'uploads', true)
on conflict do nothing;

create policy "Allow all uploads" on storage.objects for all using (bucket_id = 'uploads') with check (bucket_id = 'uploads');
