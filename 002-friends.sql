-- Rate My Coconut Water: friends
-- Run in Supabase AFTER setup.sql: SQL Editor -> New query -> paste all of this -> Run.
-- Safe to run again; it replaces its own functions and rules instead of duplicating them.
--
-- What it adds:
--   * profiles     - each person's unique username (how friends find each other)
--   * friendships  - one row per pair: pending request, or accepted friends
--   * functions    - send / accept / decline / cancel / unfriend, and a list of your friendships
--   * new read rules so accepted friends can SEE (never change) each other's ratings and photos

-- 1. Profiles: one username per person ---------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  username    text not null check (username ~ '^[a-z0-9_]{3,20}$'),
  created_at  timestamptz not null default now()
);
create unique index if not exists profiles_username_key on public.profiles (username);

alter table public.profiles enable row level security;
revoke all on public.profiles from anon;
grant select, insert, update on public.profiles to authenticated;

drop policy if exists "profiles: read own"   on public.profiles;
drop policy if exists "profiles: add own"    on public.profiles;
drop policy if exists "profiles: edit own"   on public.profiles;
create policy "profiles: read own" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "profiles: add own"  on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "profiles: edit own" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
-- Nobody can browse other people's profiles. Friends' usernames come from my_friendships() below.

-- 2. Friendships: one row per pair --------------------------------------------------
create table if not exists public.friendships (
  id            uuid primary key default gen_random_uuid(),
  requester     uuid not null references auth.users (id) on delete cascade,
  addressee     uuid not null references auth.users (id) on delete cascade,
  status        text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at    timestamptz not null default now(),
  responded_at  timestamptz,
  check (requester <> addressee)
);
-- Only one row per pair, whichever way round it was sent.
create unique index if not exists friendships_pair_key on public.friendships (least(requester, addressee), greatest(requester, addressee));
create index if not exists friendships_addressee_idx on public.friendships (addressee);
create index if not exists friendships_requester_idx on public.friendships (requester);

alter table public.friendships enable row level security;
revoke all on public.friendships from anon, authenticated;
grant select on public.friendships to authenticated;  -- all changes go through the functions below

drop policy if exists "friendships: read own" on public.friendships;
create policy "friendships: read own" on public.friendships for select to authenticated
  using ((select auth.uid()) in (requester, addressee));

-- 3. Functions ---------------------------------------------------------------------
-- These run with elevated rights, so each one checks who is calling (auth.uid()) itself.

-- Everyone you are accepted friends with. Used by the read rules below.
create or replace function public.friend_ids()
returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select case when f.requester = auth.uid() then f.addressee else f.requester end
  from public.friendships f
  where f.status = 'accepted' and auth.uid() in (f.requester, f.addressee);
$$;

-- Your friendships with the other person's username, for the Friends screen.
create or replace function public.my_friendships()
returns table (id uuid, friend_id uuid, username text, status text, incoming boolean, created_at timestamptz)
language sql stable security definer
set search_path = ''
as $$
  select f.id,
         o.other,
         coalesce(p.username, 'unknown'),
         f.status,
         (f.addressee = auth.uid() and f.status = 'pending'),
         f.created_at
  from public.friendships f
  cross join lateral (select case when f.requester = auth.uid() then f.addressee else f.requester end as other) o
  left join public.profiles p on p.id = o.other
  where auth.uid() in (f.requester, f.addressee)
  order by f.created_at desc;
$$;

-- Send a request by exact username. Returns one of:
--   sent | accepted (they had already asked you, so you're now friends) | already_friends | already_sent
--   not_found | self | no_username (pick your own username first) | too_many
create or replace function public.send_friend_request(p_username text)
returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  me     uuid := auth.uid();
  them   uuid;
  row_   public.friendships%rowtype;
begin
  if me is null then raise exception 'Not signed in'; end if;
  if not exists (select 1 from public.profiles where id = me) then return 'no_username'; end if;

  select id into them from public.profiles where username = lower(trim(both from ltrim(trim(p_username), '@')));
  if them is null then return 'not_found'; end if;
  if them = me then return 'self'; end if;

  select * into row_ from public.friendships
   where least(requester, addressee) = least(me, them) and greatest(requester, addressee) = greatest(me, them);

  if found then
    if row_.status = 'accepted' then return 'already_friends'; end if;
    if row_.requester = me then return 'already_sent'; end if;
    update public.friendships set status = 'accepted', responded_at = now() where id = row_.id;
    return 'accepted';
  end if;

  if (select count(*) from public.friendships where requester = me and status = 'pending') >= 50 then
    return 'too_many';
  end if;

  begin
    insert into public.friendships (requester, addressee) values (me, them);
  exception when unique_violation then
    return 'already_sent';  -- they sent one to you at the same moment; it will show under requests
  end;
  return 'sent';
end;
$$;

-- Accept (true) or decline (false) a request someone sent you.
create or replace function public.respond_friend_request(p_id uuid, p_accept boolean)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if p_accept then
    update public.friendships set status = 'accepted', responded_at = now()
     where id = p_id and addressee = auth.uid() and status = 'pending';
  else
    delete from public.friendships
     where id = p_id and addressee = auth.uid() and status = 'pending';
  end if;
  if not found then raise exception 'That request is no longer available'; end if;
end;
$$;

-- Cancel a request you sent, or unfriend someone. Either person can do this.
create or replace function public.remove_friendship(p_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  delete from public.friendships where id = p_id and auth.uid() in (requester, addressee);
end;
$$;

revoke all on function public.friend_ids()                          from public, anon;
revoke all on function public.my_friendships()                      from public, anon;
revoke all on function public.send_friend_request(text)             from public, anon;
revoke all on function public.respond_friend_request(uuid, boolean) from public, anon;
revoke all on function public.remove_friendship(uuid)               from public, anon;
grant execute on function public.friend_ids()                          to authenticated;
grant execute on function public.my_friendships()                      to authenticated;
grant execute on function public.send_friend_request(text)             to authenticated;
grant execute on function public.respond_friend_request(uuid, boolean) to authenticated;
grant execute on function public.remove_friendship(uuid)               to authenticated;

-- 4. Friends can read (never change) each other's ratings and photos -----------------
-- These ADD to the "own" rules in setup.sql. Edit/delete rules are unchanged: own rows only.
drop policy if exists "ratings: friends read" on public.ratings;
create policy "ratings: friends read" on public.ratings for select to authenticated
  using (user_id in (select public.friend_ids()));

drop policy if exists "photos: friends read" on storage.objects;
create policy "photos: friends read" on storage.objects for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] in (select f::text from public.friend_ids() f));
