-- Rate My Coconut Water: one-time database setup
-- Run in Supabase: SQL Editor -> New query -> paste all of this -> Run.
-- Safe to run again; it replaces its own rules instead of duplicating them.

-- 1. Ratings: one row per rating, owned by the person who made it ---------------
create table if not exists public.ratings (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 120),
  category    text not null check (char_length(category) between 1 and 40),
  score       smallint not null check (score between 1 and 10),
  notes       text not null default '' check (char_length(notes) <= 5000),
  photo_path  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists ratings_user_created_idx on public.ratings (user_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists ratings_set_updated_at on public.ratings;
create trigger ratings_set_updated_at
  before update on public.ratings
  for each row execute function public.set_updated_at();

-- 2. Categories: each person's own list -------------------------------------------
create table if not exists public.categories (
  user_id  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name     text not null check (char_length(name) between 1 and 40),
  sort     integer not null default 0,
  primary key (user_id, name)
);

-- 3. Privacy rules: you can only see and change your own rows ----------------------
alter table public.ratings    enable row level security;
alter table public.categories enable row level security;

revoke all on public.ratings, public.categories from anon;
grant select, insert, update, delete on public.ratings, public.categories to authenticated;

drop policy if exists "ratings: read own"   on public.ratings;
drop policy if exists "ratings: add own"    on public.ratings;
drop policy if exists "ratings: edit own"   on public.ratings;
drop policy if exists "ratings: delete own" on public.ratings;
create policy "ratings: read own"   on public.ratings for select to authenticated using ((select auth.uid()) = user_id);
create policy "ratings: add own"    on public.ratings for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "ratings: edit own"   on public.ratings for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "ratings: delete own" on public.ratings for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "categories: read own"   on public.categories;
drop policy if exists "categories: add own"    on public.categories;
drop policy if exists "categories: edit own"   on public.categories;
drop policy if exists "categories: delete own" on public.categories;
create policy "categories: read own"   on public.categories for select to authenticated using ((select auth.uid()) = user_id);
create policy "categories: add own"    on public.categories for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "categories: edit own"   on public.categories for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "categories: delete own" on public.categories for delete to authenticated using ((select auth.uid()) = user_id);

-- 4. Photos: a private bucket; each person can only touch files in their own folder -
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 5242880, array['image/jpeg'])
on conflict (id) do update
  set public = false,
      file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg'];

drop policy if exists "photos: read own"   on storage.objects;
drop policy if exists "photos: add own"    on storage.objects;
drop policy if exists "photos: edit own"   on storage.objects;
drop policy if exists "photos: delete own" on storage.objects;
create policy "photos: read own"   on storage.objects for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "photos: add own"    on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "photos: edit own"   on storage.objects for update to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "photos: delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
