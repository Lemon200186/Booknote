-- Run this once in Supabase → SQL Editor. Safe to run again (idempotent).

-- 1) Notes: one row per book (the whole book object is stored as JSON text).
create table if not exists public.books (
  id text not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ts bigint not null,
  deleted boolean not null default false,
  json text,
  primary key (user_id, id)
);
alter table public.books enable row level security;
drop policy if exists "own rows" on public.books;
create policy "own rows" on public.books for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update, delete on public.books to authenticated;

-- 2) Private photo bucket: each user can only touch files under their own user-id folder.
insert into storage.buckets (id, name, public) values ('photos', 'photos', false) on conflict (id) do nothing;
drop policy if exists "photos own read" on storage.objects;
create policy "photos own read" on storage.objects for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "photos own insert" on storage.objects;
create policy "photos own insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "photos own delete" on storage.objects;
create policy "photos own delete" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
