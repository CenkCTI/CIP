-- Record the verified production fix for Evidence Storage signed-upload RLS.
-- Storage object names are scoped as userId/projectId/fileName. Project
-- ownership is checked through a SECURITY DEFINER helper so policies never cast
-- untrusted Storage path segments to uuid.

create or replace function public.evidence_storage_project_is_owned(project_id_text text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.projects p
    where p.id::text = project_id_text
      and p.owner_id = auth.uid()
  );
$$;

revoke all on function public.evidence_storage_project_is_owned(text) from public;
revoke all on function public.evidence_storage_project_is_owned(text) from anon;
grant execute on function public.evidence_storage_project_is_owned(text) to authenticated;

drop policy if exists "evidence storage read own" on storage.objects;
drop policy if exists "evidence storage insert own" on storage.objects;
drop policy if exists "evidence storage update own" on storage.objects;
drop policy if exists "evidence storage delete own" on storage.objects;

create policy "evidence storage read own" on storage.objects
for select to authenticated
using (
  bucket_id = 'evidence'
  and array_length(storage.foldername(name), 1) = 2
  and (storage.foldername(name))[1] = auth.uid()::text
  and storage.filename(name) <> ''
  and public.evidence_storage_project_is_owned((storage.foldername(name))[2])
);

create policy "evidence storage insert own" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'evidence'
  and array_length(storage.foldername(name), 1) = 2
  and (storage.foldername(name))[1] = auth.uid()::text
  and storage.filename(name) <> ''
  and public.evidence_storage_project_is_owned((storage.foldername(name))[2])
);

create policy "evidence storage update own" on storage.objects
for update to authenticated
using (
  bucket_id = 'evidence'
  and array_length(storage.foldername(name), 1) = 2
  and (storage.foldername(name))[1] = auth.uid()::text
  and storage.filename(name) <> ''
  and public.evidence_storage_project_is_owned((storage.foldername(name))[2])
)
with check (
  bucket_id = 'evidence'
  and array_length(storage.foldername(name), 1) = 2
  and (storage.foldername(name))[1] = auth.uid()::text
  and storage.filename(name) <> ''
  and public.evidence_storage_project_is_owned((storage.foldername(name))[2])
);

create policy "evidence storage delete own" on storage.objects
for delete to authenticated
using (
  bucket_id = 'evidence'
  and array_length(storage.foldername(name), 1) = 2
  and (storage.foldername(name))[1] = auth.uid()::text
  and storage.filename(name) <> ''
  and public.evidence_storage_project_is_owned((storage.foldername(name))[2])
);
