-- CITEM Stage 3 Processing Foundation hardening
-- Forward migration for databases where 058 was already applied before the
-- provenance integrity/deletion semantics were finalized.

do $$
begin
  if exists (
    select 1
    from public.source_annotation_outputs o
    join public.source_attribution_claims c
      on c.project_id=o.project_id
     and c.id=o.attribution_claim_id
    where o.attribution_claim_id is not null
      and o.source_annotation_id<>c.source_annotation_id
  ) then
    raise exception
      'STAGE3_PROVENANCE_MISMATCH: attribution claim output points to a different source annotation';
  end if;
end
$$;

alter table public.source_annotations
  drop constraint if exists source_annotations_processing_state_consistency,
  add constraint source_annotations_processing_state_consistency
    check(
      (
        (processing_state='UNPROCESSED' and processed_at is null and processed_by is null)
        or
        (processing_state in ('PROCESSED','IGNORED') and processed_at is not null and processed_by is not null)
      )
      and
      (
        processing_state <> 'IGNORED'
        or char_length(trim(coalesce(processing_note,''))) > 0
      )
    );

create unique index if not exists source_attribution_claims_annotation_identity_uq
  on public.source_attribution_claims(project_id,source_annotation_id,id);

do $$
declare c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid='public.source_attribution_claims'::regclass
      and confrelid='public.source_annotations'::regclass
      and contype='f'
  loop
    execute format(
      'alter table public.source_attribution_claims drop constraint %I',
      c.conname
    );
  end loop;
end
$$;

alter table public.source_attribution_claims
  add constraint source_attribution_claims_annotation_fk
  foreign key(project_id,source_annotation_id)
  references public.source_annotations(project_id,id)
  on delete restrict;

do $$
declare c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid='public.source_annotation_outputs'::regclass
      and confrelid='public.source_annotations'::regclass
      and contype='f'
  loop
    execute format(
      'alter table public.source_annotation_outputs drop constraint %I',
      c.conname
    );
  end loop;
end
$$;

alter table public.source_annotation_outputs
  add constraint source_annotation_outputs_annotation_fk
  foreign key(project_id,source_annotation_id)
  references public.source_annotations(project_id,id)
  on delete restrict;

do $$
declare c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid='public.source_annotation_outputs'::regclass
      and confrelid='public.source_attribution_claims'::regclass
      and contype='f'
  loop
    execute format(
      'alter table public.source_annotation_outputs drop constraint %I',
      c.conname
    );
  end loop;
end
$$;

alter table public.source_annotation_outputs
  add constraint source_annotation_outputs_attribution_claim_fk
  foreign key(project_id,source_annotation_id,attribution_claim_id)
  references public.source_attribution_claims(project_id,source_annotation_id,id)
  on delete cascade;

grant select,insert,update,delete
  on public.source_attribution_claims to authenticated;
grant select,insert,delete
  on public.source_annotation_outputs to authenticated;

comment on table public.source_annotation_outputs is
  'Analyst-controlled provenance ledger from one source annotation to analyst-created or analyst-linked structured CITEM records. Durable CTI targets are delete-restricted until provenance is explicitly unlinked; annotation-bound source attribution claims are deleted together with their ledger row. It is not an analytical relationship graph.';
