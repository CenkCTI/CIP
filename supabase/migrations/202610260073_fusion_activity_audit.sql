-- Narrow append-only audit for Fusion mutations; source and note payloads are not copied into log.
create table public.fusion_activity_events (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete cascade,
 actor_id uuid references auth.users(id) on delete set null,
 object_table text not null,
 object_id uuid not null,
 action text not null check (action in ('INSERT','UPDATE','DELETE')),
 detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail)='object'),
 created_at timestamptz not null default now()
);
create index fusion_activity_events_recent_idx on public.fusion_activity_events(project_id,created_at desc,id);
alter table public.fusion_activity_events enable row level security;
grant select on public.fusion_activity_events to authenticated;
create policy fusion_activity_events_select_owned on public.fusion_activity_events for select to authenticated
 using(public.project_is_owned(project_id));
create function public.fusion_write_audit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare item record; v_project uuid; v_id uuid;
begin
 if tg_op='DELETE' then
  v_project=old.project_id;v_id=old.id;
 else
  v_project=new.project_id;v_id=new.id;
 end if;
 insert into public.fusion_activity_events(project_id,actor_id,object_table,object_id,action,detail)
 values(v_project,auth.uid(),tg_table_name,v_id,tg_op,
  jsonb_build_object('recordFamily',tg_table_name));
 if tg_op='DELETE' then return old;end if;
 return new;
end $$;
revoke all on function public.fusion_write_audit() from public,anon,authenticated;
create trigger fusion_note_audit after insert or update or delete on public.investigation_country_notes
 for each row execute function public.fusion_write_audit();
create trigger fusion_link_audit after insert or update or delete on public.investigation_country_links
 for each row execute function public.fusion_write_audit();
create trigger fusion_attach_audit after insert or delete on public.fusion_attachment_links
 for each row execute function public.fusion_write_audit();
create trigger fusion_graph_relationship_audit after insert or update or delete on public.entity_relationships
 for each row execute function public.fusion_write_audit();
comment on table public.fusion_activity_events is 'Minimal mutation audit for Fusion and existing manual graph relationships. No sensitive content duplication.';
