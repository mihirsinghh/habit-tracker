create extension if not exists "pgcrypto";

create table if not exists public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  emoji text not null default '✨',
  description text not null default '',
  frequency text not null default 'daily',
  metric text not null default 'times',
  target integer not null check (target > 0),
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.habit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  habit_id uuid not null references public.habits (id) on delete cascade,
  date date not null,
  count integer not null check (count >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  unique (habit_id, date)
);

alter table public.habits enable row level security;
alter table public.habit_logs enable row level security;

create policy "Users manage own habits"
on public.habits
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users manage own habit logs"
on public.habit_logs
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
