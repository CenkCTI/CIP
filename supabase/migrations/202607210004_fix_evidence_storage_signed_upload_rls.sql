-- Fix production signed evidence uploads by aligning Storage RLS with the
-- exact object path issued by createSignedUploadUrl: userId/projectId/fileName.
-- The preceding Phase 2 policy cast an untrusted path segment to uuid, and the
-- first hardening pass did not mirror Supabase Storage's signed-upload SELECT
-- metadata needs with the requested auth.jwt()->>'sub' ownership predicate.

drop policy if exists "evidence storage read own" on storage.objects;
drop policy if exists "evidence storage insert own" on storage.objects;
drop policy if exists "evidence storage update own" on storage.objects;
drop policy if exists "evidence storage delete own" on storage.objects;

create policy "evidence storage read own" on storage.objects
for select to authenticated
using (
  bucket_id = 'evidence'
  and (storage.foldername(name))[1] = (select auth.jwt()->>'sub')
  and array_length(storage.foldername(name), 1) = 2
  and storage.filename(name) <> ''
  and exists (
    select 1
    from public.projects p
    where p.id::text = (storage.foldername(name))[2]
      and p.owner_id = (select auth.uid())
  )
);

create policy "evidence storage insert own" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'evidence'
  and (storage.foldername(name))[1] = (select auth.jwt()->>'sub')
  and array_length(storage.foldername(name), 1) = 2
  and storage.filename(name) <> ''
  and exists (
    select 1
    from public.projects p
    where p.id::text = (storage.foldername(name))[2]
      and p.owner_id = (select auth.uid())
  )
);

create policy "evidence storage update own" on storage.objects
for update to authenticated
using (
  bucket_id = 'evidence'
  and (storage.foldername(name))[1] = (select auth.jwt()->>'sub')
  and array_length(storage.foldername(name), 1) = 2
  and storage.filename(name) <> ''
  and exists (
    select 1
    from public.projects p
    where p.id::text = (storage.foldername(name))[2]
      and p.owner_id = (select auth.uid())
  )
)
with check (
  bucket_id = 'evidence'
  and (storage.foldername(name))[1] = (select auth.jwt()->>'sub')
  and array_length(storage.foldername(name), 1) = 2
  and storage.filename(name) <> ''
  and exists (
    select 1
    from public.projects p
    where p.id::text = (storage.foldername(name))[2]
      and p.owner_id = (select auth.uid())
  )
);

create policy "evidence storage delete own" on storage.objects
for delete to authenticated
using (
  bucket_id = 'evidence'
  and (storage.foldername(name))[1] = (select auth.jwt()->>'sub')
  and array_length(storage.foldername(name), 1) = 2
  and storage.filename(name) <> ''
  and exists (
    select 1
    from public.projects p
    where p.id::text = (storage.foldername(name))[2]
      and p.owner_id = (select auth.uid())
  )
);
