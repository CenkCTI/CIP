-- Harden evidence Storage RLS path parsing so malformed object names such as
-- {userId}//file.png are denied by policy predicates without casting any
-- untrusted object-name segment to uuid.

drop policy if exists "evidence storage read own" on storage.objects;
drop policy if exists "evidence storage insert own" on storage.objects;
drop policy if exists "evidence storage update own" on storage.objects;
drop policy if exists "evidence storage delete own" on storage.objects;

create policy "evidence storage read own" on storage.objects
for select to authenticated
using (
  bucket_id = 'evidence'
  and split_part(name, '/', 1) = auth.uid()::text
  and split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and split_part(name, '/', 3) <> ''
  and split_part(name, '/', 4) = ''
  and position('//' in name) = 0
  and exists (
    select 1 from public.projects p
    where p.id::text = split_part(name, '/', 2)
      and p.owner_id::text = split_part(name, '/', 1)
      and p.owner_id = auth.uid()
  )
);

create policy "evidence storage insert own" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'evidence'
  and split_part(name, '/', 1) = auth.uid()::text
  and split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and split_part(name, '/', 3) <> ''
  and split_part(name, '/', 4) = ''
  and position('//' in name) = 0
  and exists (
    select 1 from public.projects p
    where p.id::text = split_part(name, '/', 2)
      and p.owner_id::text = split_part(name, '/', 1)
      and p.owner_id = auth.uid()
  )
);

create policy "evidence storage update own" on storage.objects
for update to authenticated
using (
  bucket_id = 'evidence'
  and split_part(name, '/', 1) = auth.uid()::text
  and split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and split_part(name, '/', 3) <> ''
  and split_part(name, '/', 4) = ''
  and position('//' in name) = 0
  and exists (
    select 1 from public.projects p
    where p.id::text = split_part(name, '/', 2)
      and p.owner_id::text = split_part(name, '/', 1)
      and p.owner_id = auth.uid()
  )
)
with check (
  bucket_id = 'evidence'
  and split_part(name, '/', 1) = auth.uid()::text
  and split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and split_part(name, '/', 3) <> ''
  and split_part(name, '/', 4) = ''
  and position('//' in name) = 0
  and exists (
    select 1 from public.projects p
    where p.id::text = split_part(name, '/', 2)
      and p.owner_id::text = split_part(name, '/', 1)
      and p.owner_id = auth.uid()
  )
);

create policy "evidence storage delete own" on storage.objects
for delete to authenticated
using (
  bucket_id = 'evidence'
  and split_part(name, '/', 1) = auth.uid()::text
  and split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and split_part(name, '/', 3) <> ''
  and split_part(name, '/', 4) = ''
  and position('//' in name) = 0
  and exists (
    select 1 from public.projects p
    where p.id::text = split_part(name, '/', 2)
      and p.owner_id::text = split_part(name, '/', 1)
      and p.owner_id = auth.uid()
  )
);
