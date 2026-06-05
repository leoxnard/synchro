create extension if not exists pgcrypto;

create table if not exists public.htt_rooms (
    id uuid primary key default gen_random_uuid(),
    token text not null unique,
    mode text not null check (mode in ('local', 'online')),
    beat_id text not null,
    silent_bars integer not null check (silent_bars between 1 and 16),
    phase text not null default 'lobby' check (phase in ('lobby', 'running', 'round_result', 'final', 'sync_failed')),
    sync_failed_player_ids text[] not null default '{}',
    current_round integer not null default 0,
    total_rounds integer not null default 5,
    current_beat_id text,
    active_round_id uuid,
    round_starts_at timestamptz,
    locked_at timestamptz,
    updated_at timestamptz not null default now(),
    created_at timestamptz not null default now()
);

-- Synchronized-start anchor (server-time domain). Idempotent for existing rooms.
alter table public.htt_rooms add column if not exists round_starts_at timestamptz;

-- Server clock source for NTP-style offset estimation on each client.
-- Clients call this a few times, keep the smallest-RTT sample, and derive their
-- offset to server time so the countdown anchor lands together on every device.
create or replace function public.htt_now()
returns timestamptz
language sql
stable
as $$ select now(); $$;

grant execute on function public.htt_now() to anon, authenticated;

do $$
declare
    phase_constraint_name text;
begin
    select c.conname
    into phase_constraint_name
    from pg_constraint c
    join pg_class rel on rel.oid = c.conrelid
    join pg_namespace n on n.oid = rel.relnamespace
    where n.nspname = 'public'
      and rel.relname = 'htt_rooms'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) like '%phase in (%';

    if phase_constraint_name is not null then
        execute format('alter table public.htt_rooms drop constraint %I', phase_constraint_name);
    end if;

    if not exists (
        select 1
        from pg_constraint c
        join pg_class rel on rel.oid = c.conrelid
        join pg_namespace n on n.oid = rel.relnamespace
        where n.nspname = 'public'
          and rel.relname = 'htt_rooms'
          and c.contype = 'c'
          and c.conname = 'htt_rooms_phase_check'
    ) then
        alter table public.htt_rooms
            add constraint htt_rooms_phase_check
            check (phase in ('lobby', 'running', 'round_result', 'final', 'sync_failed'));
    end if;

    if not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'htt_rooms'
          and column_name = 'sync_failed_player_ids'
    ) then
        alter table public.htt_rooms
            add column sync_failed_player_ids text[] not null default '{}';
    end if;
end $$;

create table if not exists public.htt_room_players (
    id uuid primary key default gen_random_uuid(),
    room_id uuid not null references public.htt_rooms(id) on delete cascade,
    player_id text not null,
    player_name text not null,
    is_host boolean not null default false,
    ready boolean not null default true,
    first_tap_at timestamptz,
    is_banned boolean not null default false,
    is_online boolean not null default true,
    last_seen_at timestamptz not null default now(),
    joined_at timestamptz not null default now(),
    unique (room_id, player_id)
);

alter table public.htt_room_players add column if not exists is_online boolean not null default true;
alter table public.htt_room_players add column if not exists last_seen_at timestamptz not null default now();
alter table public.htt_room_players add column if not exists first_tap_at timestamptz;
alter table public.htt_room_players add column if not exists is_banned boolean not null default false;

create table if not exists public.htt_room_rounds (
    id uuid primary key default gen_random_uuid(),
    room_id uuid not null references public.htt_rooms(id) on delete cascade,
    round_number integer not null,
    beat_id text not null,
    status text not null default 'running' check (status in ('running', 'complete')),
    started_at timestamptz not null default now(),
    finished_at timestamptz,
    unique (room_id, round_number)
);

create table if not exists public.htt_room_results (
    id uuid primary key default gen_random_uuid(),
    room_id uuid not null references public.htt_rooms(id) on delete cascade,
    round_id uuid not null references public.htt_room_rounds(id) on delete cascade,
    round_number integer not null,
    player_id text not null,
    player_name text not null,
    score numeric(6, 1) not null,
    consistency_score numeric(6, 1) not null,
    accuracy_score numeric(6, 1) not null,
    analysis jsonb,
    created_at timestamptz not null default now(),
    unique (room_id, round_number, player_id)
);

create index if not exists idx_htt_rooms_token on public.htt_rooms(token);
create index if not exists idx_htt_room_players_room_id on public.htt_room_players(room_id);
create index if not exists idx_htt_room_players_banned on public.htt_room_players(room_id, is_banned);
create index if not exists idx_htt_room_rounds_room_id on public.htt_room_rounds(room_id);
create index if not exists idx_htt_room_results_room_round on public.htt_room_results(room_id, round_number);

alter table public.htt_rooms enable row level security;
alter table public.htt_room_players enable row level security;

do $$
begin
    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'htt_rooms'
          and policyname = 'rooms_select_all'
    ) then
        execute 'create policy "rooms_select_all" on public.htt_rooms for select to anon, authenticated using (true)';
    end if;
end $$;

do $$
begin
    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'htt_rooms'
          and policyname = 'rooms_insert_all'
    ) then
        execute 'create policy "rooms_insert_all" on public.htt_rooms for insert to anon, authenticated with check (true)';
    end if;
end $$;

do $$
begin
    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'htt_rooms'
          and policyname = 'rooms_update_all'
    ) then
        execute 'create policy "rooms_update_all" on public.htt_rooms for update to anon, authenticated using (true) with check (true)';
    end if;
end $$;

do $$
begin
    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'htt_room_players'
          and policyname = 'players_select_all'
    ) then
        execute 'create policy "players_select_all" on public.htt_room_players for select to anon, authenticated using (true)';
    end if;
end $$;

do $$
begin
    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'htt_room_players'
          and policyname = 'players_insert_all'
    ) then
        execute 'create policy "players_insert_all" on public.htt_room_players for insert to anon, authenticated with check (true)';
    end if;
end $$;

do $$
begin
    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'htt_room_players'
          and policyname = 'players_update_all'
    ) then
        execute 'create policy "players_update_all" on public.htt_room_players for update to anon, authenticated using (true) with check (true)';
    end if;
end $$;

do $$
begin
    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'htt_room_players'
          and policyname = 'players_delete_all'
    ) then
        execute 'create policy "players_delete_all" on public.htt_room_players for delete to anon, authenticated using (true)';
    end if;
end $$;

create policy "rounds_select_all"
on public.htt_room_rounds
for select
to anon, authenticated
using (true);

create policy "rounds_insert_all"
on public.htt_room_rounds
for insert
to anon, authenticated
with check (true);

create policy "rounds_update_all"
on public.htt_room_rounds
for update
to anon, authenticated
using (true)
with check (true);

create policy "results_select_all"
on public.htt_room_results
for select
to anon, authenticated
using (true);

create policy "results_insert_all"
on public.htt_room_results
for insert
to anon, authenticated
with check (true);

create policy "results_update_all"
on public.htt_room_results
for update
to anon, authenticated
using (true)
with check (true);

create policy "results_delete_all"
on public.htt_room_results
for delete
to anon, authenticated
using (true);

do $$
begin
    if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'htt_room_players'
    ) then
        alter publication supabase_realtime add table public.htt_room_players;
    end if;
end $$;

do $$
begin
    if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'htt_rooms'
    ) then
        alter publication supabase_realtime add table public.htt_rooms;
    end if;
end $$;

do $$
begin
    if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'htt_room_rounds'
    ) then
        alter publication supabase_realtime add table public.htt_room_rounds;
    end if;
end $$;

do $$
begin
    if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'htt_room_results'
    ) then
        alter publication supabase_realtime add table public.htt_room_results;
    end if;
end $$;
