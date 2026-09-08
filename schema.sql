-- شغّل هذا الملف مرة واحدة داخل Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'محادثة جديدة',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  attachment_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.competitions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  conditions text not null default '',
  dates text not null default '',
  documents text not null default '',
  steps text not null default '',
  last_updated timestamptz not null default now()
);

alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.competitions enable row level security;

drop policy if exists "Users can read their conversations" on public.conversations;
create policy "Users can read their conversations" on public.conversations for select using (auth.uid() = user_id);
drop policy if exists "Users can create their conversations" on public.conversations;
create policy "Users can create their conversations" on public.conversations for insert with check (auth.uid() = user_id);
drop policy if exists "Users can update their conversations" on public.conversations;
create policy "Users can update their conversations" on public.conversations for update using (auth.uid() = user_id);
drop policy if exists "Users can delete their conversations" on public.conversations;
create policy "Users can delete their conversations" on public.conversations for delete using (auth.uid() = user_id);

drop policy if exists "Users can read messages in their conversations" on public.messages;
create policy "Users can read messages in their conversations" on public.messages for select using (exists (select 1 from public.conversations c where c.id = conversation_id and c.user_id = auth.uid()));
drop policy if exists "Users can create messages in their conversations" on public.messages;
create policy "Users can create messages in their conversations" on public.messages for insert with check (exists (select 1 from public.conversations c where c.id = conversation_id and c.user_id = auth.uid()));
drop policy if exists "Users can delete messages in their conversations" on public.messages;
create policy "Users can delete messages in their conversations" on public.messages for delete using (exists (select 1 from public.conversations c where c.id = conversation_id and c.user_id = auth.uid()));

drop policy if exists "Anyone can read competitions" on public.competitions;
create policy "Anyone can read competitions" on public.competitions for select using (true);
drop policy if exists "Admin can create competitions" on public.competitions;
create policy "Admin can create competitions" on public.competitions for insert with check (lower(coalesce(auth.jwt() ->> 'email', '')) = 'alqasmhapip468@gmail.com');
drop policy if exists "Admin can update competitions" on public.competitions;
create policy "Admin can update competitions" on public.competitions for update using (lower(coalesce(auth.jwt() ->> 'email', '')) = 'alqasmhapip468@gmail.com');
drop policy if exists "Admin can delete competitions" on public.competitions;
create policy "Admin can delete competitions" on public.competitions for delete using (lower(coalesce(auth.jwt() ->> 'email', '')) = 'alqasmhapip468@gmail.com');

create index if not exists conversations_user_id_updated_at_idx on public.conversations(user_id, updated_at desc);
create index if not exists messages_conversation_id_created_at_idx on public.messages(conversation_id, created_at);
