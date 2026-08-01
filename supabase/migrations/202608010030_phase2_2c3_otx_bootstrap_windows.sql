-- Phase 2.2C.3 repair: bounded shorter OTX bootstrap windows.
begin;
alter table public.otx_connection_settings drop constraint otx_connection_settings_bootstrap_lookback_days_check;
alter table public.otx_connection_settings alter column bootstrap_lookback_days set default 7;
alter table public.otx_connection_settings add constraint otx_connection_settings_bootstrap_lookback_days_check check(bootstrap_lookback_days in(1,3,7,14,30,90,180,365));

create or replace function public.configure_otx_connection(p_owner_id uuid,p_connection_id uuid,p_ciphertext_b64 text,p_iv_b64 text,p_auth_tag_b64 text,p_key_version smallint,p_bootstrap_lookback_days integer)
returns uuid language plpgsql security definer set search_path='' as $$begin
 if p_bootstrap_lookback_days not in(1,3,7,14,30,90,180,365)or char_length(p_ciphertext_b64)not between 4 and 2048 or char_length(p_iv_b64)not between 16 and 32 or char_length(p_auth_tag_b64)not between 20 and 32 or p_key_version not between 1 and 32767 or not exists(select 1 from auth.users where id=p_owner_id)then raise exception 'OTX_CONFIGURATION_INVALID';end if;
 if exists(select 1 from public.ioc_provider_connections where id=p_connection_id and(owner_id<>p_owner_id or provider_key<>'ALIENVAULT_OTX' or archived_at is not null))then raise exception 'CONNECTION_UNAVAILABLE';end if;
 insert into public.ioc_provider_connections(id,owner_id,provider_key,display_name,enabled,scheduler_enabled,sync_interval_minutes,next_scheduled_sync_at,created_by,last_checked_at,health_status)values(p_connection_id,p_owner_id,'ALIENVAULT_OTX','AlienVault OTX',true,false,15,null,p_owner_id,now(),'HEALTHY')on conflict(owner_id,provider_key)do update set enabled=true,scheduler_enabled=false,next_scheduled_sync_at=null,last_checked_at=now(),health_status='HEALTHY',last_error_code=null,last_error_message=null,updated_at=now()returning id into p_connection_id;
 insert into public.ioc_provider_credentials(owner_id,provider_connection_id,provider_key,ciphertext_b64,iv_b64,auth_tag_b64,key_version)values(p_owner_id,p_connection_id,'ALIENVAULT_OTX',p_ciphertext_b64,p_iv_b64,p_auth_tag_b64,p_key_version)on conflict(owner_id,provider_connection_id)do update set provider_key='ALIENVAULT_OTX',ciphertext_b64=excluded.ciphertext_b64,iv_b64=excluded.iv_b64,auth_tag_b64=excluded.auth_tag_b64,key_version=excluded.key_version,updated_at=now(),rotated_at=now();
 insert into public.otx_connection_settings(owner_id,provider_connection_id,bootstrap_lookback_days)values(p_owner_id,p_connection_id,p_bootstrap_lookback_days)on conflict(owner_id,provider_connection_id)do update set bootstrap_lookback_days=excluded.bootstrap_lookback_days,updated_at=now();return p_connection_id;end$$;

create or replace function public.update_otx_settings(p_owner_id uuid,p_connection_id uuid,p_bootstrap_lookback_days integer)returns boolean language plpgsql security definer set search_path='' as $$begin
 if p_bootstrap_lookback_days not in(1,3,7,14,30,90,180,365)or not exists(select 1 from public.ioc_provider_connections where owner_id=p_owner_id and id=p_connection_id and provider_key='ALIENVAULT_OTX'and archived_at is null)then raise exception 'OTX_CONFIGURATION_INVALID';end if;
 update public.otx_connection_settings set bootstrap_lookback_days=p_bootstrap_lookback_days,updated_at=now()where owner_id=p_owner_id and provider_connection_id=p_connection_id;update public.ioc_provider_connections set scheduler_enabled=false,next_scheduled_sync_at=null,updated_at=now()where owner_id=p_owner_id and id=p_connection_id;return true;end$$;

revoke all on function public.configure_otx_connection(uuid,uuid,text,text,text,smallint,integer),public.update_otx_settings(uuid,uuid,integer)from public,anon,authenticated;
grant execute on function public.configure_otx_connection(uuid,uuid,text,text,text,smallint,integer),public.update_otx_settings(uuid,uuid,integer)to service_role;
do $$declare definition text;allowed integer;rejected integer;begin
 select pg_get_constraintdef(oid)into definition from pg_constraint where conrelid='public.otx_connection_settings'::regclass and conname='otx_connection_settings_bootstrap_lookback_days_check';
 if definition is null or replace(definition,' ','')not like '%ARRAY[1,3,7,14,30,90,180,365]%'then raise exception 'exact OTX bootstrap constraint missing';end if;
 foreach allowed in array array[1,3,7,14,30,90,180,365]loop if not allowed=any(array[1,3,7,14,30,90,180,365])then raise exception 'allowed OTX window missing: %',allowed;end if;end loop;
 foreach rejected in array array[0,2,15,366]loop if rejected=any(array[1,3,7,14,30,90,180,365])then raise exception 'rejected OTX window allowed: %',rejected;end if;end loop;
 if(select column_default from information_schema.columns where table_schema='public'and table_name='otx_connection_settings'and column_name='bootstrap_lookback_days')not like '7%'then raise exception 'OTX bootstrap default is not 7';end if;
 if exists(select 1 from public.otx_connection_settings where bootstrap_lookback_days not in(1,3,7,14,30,90,180,365))then raise exception 'existing OTX setting invalidated';end if;
 if has_function_privilege('authenticated','public.configure_otx_connection(uuid,uuid,text,text,text,smallint,integer)','EXECUTE')or has_function_privilege('authenticated','public.update_otx_settings(uuid,uuid,integer)','EXECUTE')then raise exception 'trusted OTX ACL broadened';end if;
 if not has_function_privilege('service_role','public.configure_otx_connection(uuid,uuid,text,text,text,smallint,integer)','EXECUTE')or not has_function_privilege('service_role','public.update_otx_settings(uuid,uuid,integer)','EXECUTE')then raise exception 'service role OTX ACL missing';end if;
 if exists(select 1 from public.ioc_provider_connections where provider_key='ALIENVAULT_OTX'and(scheduler_enabled or next_scheduled_sync_at is not null))then raise exception 'OTX scheduling enabled';end if;
end$$;
commit;
