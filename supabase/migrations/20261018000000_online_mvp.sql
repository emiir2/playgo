create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  rank text not null default '12 kyu',
  avatar_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.matchmaking_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  time_control jsonb not null,
  board_size int not null default 19 check (board_size in (9, 13, 19)),
  status text not null default 'waiting' check (status in ('waiting', 'matched', 'cancelled')),
  created_at timestamptz not null default now()
);

create unique index if not exists one_waiting_queue_per_user on public.matchmaking_queue(user_id) where status = 'waiting';
create index if not exists queue_lookup on public.matchmaking_queue(status, board_size, created_at);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  black_player_id uuid not null references auth.users(id),
  white_player_id uuid not null references auth.users(id),
  status text not null default 'playing' check (status in ('playing', 'finished', 'resigned', 'timeout', 'cancelled')),
  board jsonb not null,
  moves jsonb not null default '[]'::jsonb,
  captures jsonb not null default '{"black":0,"white":0}'::jsonb,
  passes int not null default 0,
  active_color text not null default 'black' check (active_color in ('black', 'white')),
  black_clock_ms bigint not null,
  white_clock_ms bigint not null,
  byoyomi jsonb not null default '{"black":0,"white":0}'::jsonb,
  last_move_at timestamptz not null default now(),
  result text check (result in ('black', 'white', 'draw')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.match_events (
  id bigint generated always as identity primary key,
  match_id uuid not null references public.matches(id) on delete cascade,
  sequence int not null,
  player_id uuid not null references auth.users(id),
  event_type text not null check (event_type in ('move', 'pass', 'resign', 'timeout')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(match_id, sequence)
);

alter table public.profiles enable row level security;
alter table public.matchmaking_queue enable row level security;
alter table public.matches enable row level security;
alter table public.match_events enable row level security;

create policy "users read own profile" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "users update own profile" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "users read own queue entries" on public.matchmaking_queue for select to authenticated using ((select auth.uid()) = user_id);
create policy "users read joined matches" on public.matches for select to authenticated using ((select auth.uid()) in (black_player_id, white_player_id));
create policy "users read joined events" on public.match_events for select to authenticated using (exists (select 1 from public.matches m where m.id = match_id and (select auth.uid()) in (m.black_player_id, m.white_player_id)));

create or replace function public.handle_new_user() returns trigger language plpgsql security invoker set search_path = public as $$
begin
  insert into public.profiles (id, username) values (new.id, coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1))) on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

grant select on public.profiles, public.matchmaking_queue, public.matches, public.match_events to authenticated;
