-- Fusion country and attachment foundations. This migration is additive.
-- Reference: ISO 3166-1 catalog (lukes ISO-3166 Countries with Regional Codes).
create table public.fusion_country_reference (
 iso2 text primary key check (iso2 ~ '^[A-Z]{2}$'),
 iso3 text not null unique check (iso3 ~ '^[A-Z]{3}$'),
 name_en text not null,
 region text,
 subregion text
);
insert into public.fusion_country_reference(iso2,iso3,name_en,region,subregion) values
  ('AF','AFG','Afghanistan','Asia','Southern Asia'),
  ('AX','ALA','Åland Islands','Europe','Northern Europe'),
  ('AL','ALB','Albania','Europe','Southern Europe'),
  ('DZ','DZA','Algeria','Africa','Northern Africa'),
  ('AS','ASM','American Samoa','Oceania','Polynesia'),
  ('AD','AND','Andorra','Europe','Southern Europe'),
  ('AO','AGO','Angola','Africa','Sub-Saharan Africa'),
  ('AI','AIA','Anguilla','Americas','Latin America and the Caribbean'),
  ('AQ','ATA','Antarctica','',''),
  ('AG','ATG','Antigua and Barbuda','Americas','Latin America and the Caribbean'),
  ('AR','ARG','Argentina','Americas','Latin America and the Caribbean'),
  ('AM','ARM','Armenia','Asia','Western Asia'),
  ('AW','ABW','Aruba','Americas','Latin America and the Caribbean'),
  ('AU','AUS','Australia','Oceania','Australia and New Zealand'),
  ('AT','AUT','Austria','Europe','Western Europe'),
  ('AZ','AZE','Azerbaijan','Asia','Western Asia'),
  ('BS','BHS','Bahamas','Americas','Latin America and the Caribbean'),
  ('BH','BHR','Bahrain','Asia','Western Asia'),
  ('BD','BGD','Bangladesh','Asia','Southern Asia'),
  ('BB','BRB','Barbados','Americas','Latin America and the Caribbean'),
  ('BY','BLR','Belarus','Europe','Eastern Europe'),
  ('BE','BEL','Belgium','Europe','Western Europe'),
  ('BZ','BLZ','Belize','Americas','Latin America and the Caribbean'),
  ('BJ','BEN','Benin','Africa','Sub-Saharan Africa'),
  ('BM','BMU','Bermuda','Americas','Northern America'),
  ('BT','BTN','Bhutan','Asia','Southern Asia'),
  ('BO','BOL','Bolivia, Plurinational State of','Americas','Latin America and the Caribbean'),
  ('BQ','BES','Bonaire, Sint Eustatius and Saba','Americas','Latin America and the Caribbean'),
  ('BA','BIH','Bosnia and Herzegovina','Europe','Southern Europe'),
  ('BW','BWA','Botswana','Africa','Sub-Saharan Africa'),
  ('BV','BVT','Bouvet Island','Americas','Latin America and the Caribbean'),
  ('BR','BRA','Brazil','Americas','Latin America and the Caribbean'),
  ('IO','IOT','British Indian Ocean Territory','Africa','Sub-Saharan Africa'),
  ('BN','BRN','Brunei Darussalam','Asia','South-eastern Asia'),
  ('BG','BGR','Bulgaria','Europe','Eastern Europe'),
  ('BF','BFA','Burkina Faso','Africa','Sub-Saharan Africa'),
  ('BI','BDI','Burundi','Africa','Sub-Saharan Africa'),
  ('CV','CPV','Cabo Verde','Africa','Sub-Saharan Africa'),
  ('KH','KHM','Cambodia','Asia','South-eastern Asia'),
  ('CM','CMR','Cameroon','Africa','Sub-Saharan Africa'),
  ('CA','CAN','Canada','Americas','Northern America'),
  ('KY','CYM','Cayman Islands','Americas','Latin America and the Caribbean'),
  ('CF','CAF','Central African Republic','Africa','Sub-Saharan Africa'),
  ('TD','TCD','Chad','Africa','Sub-Saharan Africa'),
  ('CL','CHL','Chile','Americas','Latin America and the Caribbean'),
  ('CN','CHN','China','Asia','Eastern Asia'),
  ('CX','CXR','Christmas Island','Oceania','Australia and New Zealand'),
  ('CC','CCK','Cocos (Keeling) Islands','Oceania','Australia and New Zealand'),
  ('CO','COL','Colombia','Americas','Latin America and the Caribbean'),
  ('KM','COM','Comoros','Africa','Sub-Saharan Africa'),
  ('CG','COG','Congo','Africa','Sub-Saharan Africa'),
  ('CD','COD','Congo, Democratic Republic of the','Africa','Sub-Saharan Africa'),
  ('CK','COK','Cook Islands','Oceania','Polynesia'),
  ('CR','CRI','Costa Rica','Americas','Latin America and the Caribbean'),
  ('CI','CIV','Côte d''Ivoire','Africa','Sub-Saharan Africa'),
  ('HR','HRV','Croatia','Europe','Southern Europe'),
  ('CU','CUB','Cuba','Americas','Latin America and the Caribbean'),
  ('CW','CUW','Curaçao','Americas','Latin America and the Caribbean'),
  ('CY','CYP','Cyprus','Asia','Western Asia'),
  ('CZ','CZE','Czechia','Europe','Eastern Europe'),
  ('DK','DNK','Denmark','Europe','Northern Europe'),
  ('DJ','DJI','Djibouti','Africa','Sub-Saharan Africa'),
  ('DM','DMA','Dominica','Americas','Latin America and the Caribbean'),
  ('DO','DOM','Dominican Republic','Americas','Latin America and the Caribbean'),
  ('EC','ECU','Ecuador','Americas','Latin America and the Caribbean'),
  ('EG','EGY','Egypt','Africa','Northern Africa'),
  ('SV','SLV','El Salvador','Americas','Latin America and the Caribbean'),
  ('GQ','GNQ','Equatorial Guinea','Africa','Sub-Saharan Africa'),
  ('ER','ERI','Eritrea','Africa','Sub-Saharan Africa'),
  ('EE','EST','Estonia','Europe','Northern Europe'),
  ('SZ','SWZ','Eswatini','Africa','Sub-Saharan Africa'),
  ('ET','ETH','Ethiopia','Africa','Sub-Saharan Africa'),
  ('FK','FLK','Falkland Islands (Malvinas)','Americas','Latin America and the Caribbean'),
  ('FO','FRO','Faroe Islands','Europe','Northern Europe'),
  ('FJ','FJI','Fiji','Oceania','Melanesia'),
  ('FI','FIN','Finland','Europe','Northern Europe'),
  ('FR','FRA','France','Europe','Western Europe'),
  ('GF','GUF','French Guiana','Americas','Latin America and the Caribbean'),
  ('PF','PYF','French Polynesia','Oceania','Polynesia'),
  ('TF','ATF','French Southern Territories','Africa','Sub-Saharan Africa'),
  ('GA','GAB','Gabon','Africa','Sub-Saharan Africa'),
  ('GM','GMB','Gambia','Africa','Sub-Saharan Africa'),
  ('GE','GEO','Georgia','Asia','Western Asia'),
  ('DE','DEU','Germany','Europe','Western Europe'),
  ('GH','GHA','Ghana','Africa','Sub-Saharan Africa'),
  ('GI','GIB','Gibraltar','Europe','Southern Europe'),
  ('GR','GRC','Greece','Europe','Southern Europe'),
  ('GL','GRL','Greenland','Americas','Northern America'),
  ('GD','GRD','Grenada','Americas','Latin America and the Caribbean'),
  ('GP','GLP','Guadeloupe','Americas','Latin America and the Caribbean'),
  ('GU','GUM','Guam','Oceania','Micronesia'),
  ('GT','GTM','Guatemala','Americas','Latin America and the Caribbean'),
  ('GG','GGY','Guernsey','Europe','Northern Europe'),
  ('GN','GIN','Guinea','Africa','Sub-Saharan Africa'),
  ('GW','GNB','Guinea-Bissau','Africa','Sub-Saharan Africa'),
  ('GY','GUY','Guyana','Americas','Latin America and the Caribbean'),
  ('HT','HTI','Haiti','Americas','Latin America and the Caribbean'),
  ('HM','HMD','Heard Island and McDonald Islands','Oceania','Australia and New Zealand'),
  ('VA','VAT','Holy See','Europe','Southern Europe'),
  ('HN','HND','Honduras','Americas','Latin America and the Caribbean'),
  ('HK','HKG','Hong Kong','Asia','Eastern Asia'),
  ('HU','HUN','Hungary','Europe','Eastern Europe'),
  ('IS','ISL','Iceland','Europe','Northern Europe'),
  ('IN','IND','India','Asia','Southern Asia'),
  ('ID','IDN','Indonesia','Asia','South-eastern Asia'),
  ('IR','IRN','Iran, Islamic Republic of','Asia','Southern Asia'),
  ('IQ','IRQ','Iraq','Asia','Western Asia'),
  ('IE','IRL','Ireland','Europe','Northern Europe'),
  ('IM','IMN','Isle of Man','Europe','Northern Europe'),
  ('IL','ISR','Israel','Asia','Western Asia'),
  ('IT','ITA','Italy','Europe','Southern Europe'),
  ('JM','JAM','Jamaica','Americas','Latin America and the Caribbean'),
  ('JP','JPN','Japan','Asia','Eastern Asia'),
  ('JE','JEY','Jersey','Europe','Northern Europe'),
  ('JO','JOR','Jordan','Asia','Western Asia'),
  ('KZ','KAZ','Kazakhstan','Asia','Central Asia'),
  ('KE','KEN','Kenya','Africa','Sub-Saharan Africa'),
  ('KI','KIR','Kiribati','Oceania','Micronesia'),
  ('KP','PRK','Korea, Democratic People''s Republic of','Asia','Eastern Asia'),
  ('KR','KOR','Korea, Republic of','Asia','Eastern Asia'),
  ('KW','KWT','Kuwait','Asia','Western Asia'),
  ('KG','KGZ','Kyrgyzstan','Asia','Central Asia'),
  ('LA','LAO','Lao People''s Democratic Republic','Asia','South-eastern Asia'),
  ('LV','LVA','Latvia','Europe','Northern Europe'),
  ('LB','LBN','Lebanon','Asia','Western Asia'),
  ('LS','LSO','Lesotho','Africa','Sub-Saharan Africa'),
  ('LR','LBR','Liberia','Africa','Sub-Saharan Africa'),
  ('LY','LBY','Libya','Africa','Northern Africa'),
  ('LI','LIE','Liechtenstein','Europe','Western Europe'),
  ('LT','LTU','Lithuania','Europe','Northern Europe'),
  ('LU','LUX','Luxembourg','Europe','Western Europe'),
  ('MO','MAC','Macao','Asia','Eastern Asia'),
  ('MG','MDG','Madagascar','Africa','Sub-Saharan Africa'),
  ('MW','MWI','Malawi','Africa','Sub-Saharan Africa'),
  ('MY','MYS','Malaysia','Asia','South-eastern Asia'),
  ('MV','MDV','Maldives','Asia','Southern Asia'),
  ('ML','MLI','Mali','Africa','Sub-Saharan Africa'),
  ('MT','MLT','Malta','Europe','Southern Europe'),
  ('MH','MHL','Marshall Islands','Oceania','Micronesia'),
  ('MQ','MTQ','Martinique','Americas','Latin America and the Caribbean'),
  ('MR','MRT','Mauritania','Africa','Sub-Saharan Africa'),
  ('MU','MUS','Mauritius','Africa','Sub-Saharan Africa'),
  ('YT','MYT','Mayotte','Africa','Sub-Saharan Africa'),
  ('MX','MEX','Mexico','Americas','Latin America and the Caribbean'),
  ('FM','FSM','Micronesia, Federated States of','Oceania','Micronesia'),
  ('MD','MDA','Moldova, Republic of','Europe','Eastern Europe'),
  ('MC','MCO','Monaco','Europe','Western Europe'),
  ('MN','MNG','Mongolia','Asia','Eastern Asia'),
  ('ME','MNE','Montenegro','Europe','Southern Europe'),
  ('MS','MSR','Montserrat','Americas','Latin America and the Caribbean'),
  ('MA','MAR','Morocco','Africa','Northern Africa'),
  ('MZ','MOZ','Mozambique','Africa','Sub-Saharan Africa'),
  ('MM','MMR','Myanmar','Asia','South-eastern Asia'),
  ('NA','NAM','Namibia','Africa','Sub-Saharan Africa'),
  ('NR','NRU','Nauru','Oceania','Micronesia'),
  ('NP','NPL','Nepal','Asia','Southern Asia'),
  ('NL','NLD','Netherlands, Kingdom of the','Europe','Western Europe'),
  ('NC','NCL','New Caledonia','Oceania','Melanesia'),
  ('NZ','NZL','New Zealand','Oceania','Australia and New Zealand'),
  ('NI','NIC','Nicaragua','Americas','Latin America and the Caribbean'),
  ('NE','NER','Niger','Africa','Sub-Saharan Africa'),
  ('NG','NGA','Nigeria','Africa','Sub-Saharan Africa'),
  ('NU','NIU','Niue','Oceania','Polynesia'),
  ('NF','NFK','Norfolk Island','Oceania','Australia and New Zealand'),
  ('MK','MKD','North Macedonia','Europe','Southern Europe'),
  ('MP','MNP','Northern Mariana Islands','Oceania','Micronesia'),
  ('NO','NOR','Norway','Europe','Northern Europe'),
  ('OM','OMN','Oman','Asia','Western Asia'),
  ('PK','PAK','Pakistan','Asia','Southern Asia'),
  ('PW','PLW','Palau','Oceania','Micronesia'),
  ('PS','PSE','Palestine, State of','Asia','Western Asia'),
  ('PA','PAN','Panama','Americas','Latin America and the Caribbean'),
  ('PG','PNG','Papua New Guinea','Oceania','Melanesia'),
  ('PY','PRY','Paraguay','Americas','Latin America and the Caribbean'),
  ('PE','PER','Peru','Americas','Latin America and the Caribbean'),
  ('PH','PHL','Philippines','Asia','South-eastern Asia'),
  ('PN','PCN','Pitcairn','Oceania','Polynesia'),
  ('PL','POL','Poland','Europe','Eastern Europe'),
  ('PT','PRT','Portugal','Europe','Southern Europe'),
  ('PR','PRI','Puerto Rico','Americas','Latin America and the Caribbean'),
  ('QA','QAT','Qatar','Asia','Western Asia'),
  ('RE','REU','Réunion','Africa','Sub-Saharan Africa'),
  ('RO','ROU','Romania','Europe','Eastern Europe'),
  ('RU','RUS','Russian Federation','Europe','Eastern Europe'),
  ('RW','RWA','Rwanda','Africa','Sub-Saharan Africa'),
  ('BL','BLM','Saint Barthélemy','Americas','Latin America and the Caribbean'),
  ('SH','SHN','Saint Helena, Ascension and Tristan da Cunha','Africa','Sub-Saharan Africa'),
  ('KN','KNA','Saint Kitts and Nevis','Americas','Latin America and the Caribbean'),
  ('LC','LCA','Saint Lucia','Americas','Latin America and the Caribbean'),
  ('MF','MAF','Saint Martin (French part)','Americas','Latin America and the Caribbean'),
  ('PM','SPM','Saint Pierre and Miquelon','Americas','Northern America'),
  ('VC','VCT','Saint Vincent and the Grenadines','Americas','Latin America and the Caribbean'),
  ('WS','WSM','Samoa','Oceania','Polynesia'),
  ('SM','SMR','San Marino','Europe','Southern Europe'),
  ('ST','STP','Sao Tome and Principe','Africa','Sub-Saharan Africa'),
  ('SA','SAU','Saudi Arabia','Asia','Western Asia'),
  ('SN','SEN','Senegal','Africa','Sub-Saharan Africa'),
  ('RS','SRB','Serbia','Europe','Southern Europe'),
  ('SC','SYC','Seychelles','Africa','Sub-Saharan Africa'),
  ('SL','SLE','Sierra Leone','Africa','Sub-Saharan Africa'),
  ('SG','SGP','Singapore','Asia','South-eastern Asia'),
  ('SX','SXM','Sint Maarten (Dutch part)','Americas','Latin America and the Caribbean'),
  ('SK','SVK','Slovakia','Europe','Eastern Europe'),
  ('SI','SVN','Slovenia','Europe','Southern Europe'),
  ('SB','SLB','Solomon Islands','Oceania','Melanesia'),
  ('SO','SOM','Somalia','Africa','Sub-Saharan Africa'),
  ('ZA','ZAF','South Africa','Africa','Sub-Saharan Africa'),
  ('GS','SGS','South Georgia and the South Sandwich Islands','Americas','Latin America and the Caribbean'),
  ('SS','SSD','South Sudan','Africa','Sub-Saharan Africa'),
  ('ES','ESP','Spain','Europe','Southern Europe'),
  ('LK','LKA','Sri Lanka','Asia','Southern Asia'),
  ('SD','SDN','Sudan','Africa','Northern Africa'),
  ('SR','SUR','Suriname','Americas','Latin America and the Caribbean'),
  ('SJ','SJM','Svalbard and Jan Mayen','Europe','Northern Europe'),
  ('SE','SWE','Sweden','Europe','Northern Europe'),
  ('CH','CHE','Switzerland','Europe','Western Europe'),
  ('SY','SYR','Syrian Arab Republic','Asia','Western Asia'),
  ('TW','TWN','Taiwan, Province of China','',''),
  ('TJ','TJK','Tajikistan','Asia','Central Asia'),
  ('TZ','TZA','Tanzania, United Republic of','Africa','Sub-Saharan Africa'),
  ('TH','THA','Thailand','Asia','South-eastern Asia'),
  ('TL','TLS','Timor-Leste','Asia','South-eastern Asia'),
  ('TG','TGO','Togo','Africa','Sub-Saharan Africa'),
  ('TK','TKL','Tokelau','Oceania','Polynesia'),
  ('TO','TON','Tonga','Oceania','Polynesia'),
  ('TT','TTO','Trinidad and Tobago','Americas','Latin America and the Caribbean'),
  ('TN','TUN','Tunisia','Africa','Northern Africa'),
  ('TR','TUR','Türkiye','Asia','Western Asia'),
  ('TM','TKM','Turkmenistan','Asia','Central Asia'),
  ('TC','TCA','Turks and Caicos Islands','Americas','Latin America and the Caribbean'),
  ('TV','TUV','Tuvalu','Oceania','Polynesia'),
  ('UG','UGA','Uganda','Africa','Sub-Saharan Africa'),
  ('UA','UKR','Ukraine','Europe','Eastern Europe'),
  ('AE','ARE','United Arab Emirates','Asia','Western Asia'),
  ('GB','GBR','United Kingdom of Great Britain and Northern Ireland','Europe','Northern Europe'),
  ('UM','UMI','United States Minor Outlying Islands','Oceania','Micronesia'),
  ('US','USA','United States of America','Americas','Northern America'),
  ('UY','URY','Uruguay','Americas','Latin America and the Caribbean'),
  ('UZ','UZB','Uzbekistan','Asia','Central Asia'),
  ('VU','VUT','Vanuatu','Oceania','Melanesia'),
  ('VE','VEN','Venezuela, Bolivarian Republic of','Americas','Latin America and the Caribbean'),
  ('VN','VNM','Viet Nam','Asia','South-eastern Asia'),
  ('VG','VGB','Virgin Islands (British)','Americas','Latin America and the Caribbean'),
  ('VI','VIR','Virgin Islands (U.S.)','Americas','Latin America and the Caribbean'),
  ('WF','WLF','Wallis and Futuna','Oceania','Polynesia'),
  ('EH','ESH','Western Sahara','Africa','Northern Africa'),
  ('YE','YEM','Yemen','Asia','Western Asia'),
  ('ZM','ZMB','Zambia','Africa','Sub-Saharan Africa'),
  ('ZW','ZWE','Zimbabwe','Africa','Sub-Saharan Africa')
on conflict (iso2) do nothing;
alter table public.fusion_country_reference enable row level security;
grant select on public.fusion_country_reference to authenticated;
create policy fusion_country_reference_read on public.fusion_country_reference
 for select to authenticated using (true);

create table public.investigation_countries (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete cascade,
 country_iso2 text not null references public.fusion_country_reference(iso2),
 created_by uuid not null references auth.users(id) on delete restrict default auth.uid(),
 created_at timestamptz not null default now(),
 unique (project_id,id),
 unique (project_id,country_iso2)
);
create index investigation_countries_project_iso_idx on public.investigation_countries(project_id,country_iso2);

create table public.investigation_country_notes (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete cascade,
 investigation_country_id uuid not null,
 title text not null check(char_length(btrim(title)) between 1 and 180),
 body text not null default '' check(char_length(body)<=50000),
 created_by uuid not null references auth.users(id) on delete restrict default auth.uid(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (project_id,id),
 foreign key(project_id,investigation_country_id) references public.investigation_countries(project_id,id) on delete cascade
);
create index investigation_country_notes_country_idx on public.investigation_country_notes(project_id,investigation_country_id,updated_at desc,id);
create trigger investigation_country_notes_updated before update on public.investigation_country_notes
 for each row execute function public.set_updated_at();

-- An association is an explicit analyst organizational link, never inferred attribution.
create table public.investigation_country_links (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete cascade,
 investigation_country_id uuid not null,
 target_type text not null check(target_type in (
  'SOURCE','SOURCE_ASSET','SOURCE_NOTE','ANNOTATION','SOURCE_CLAIM','ATTRIBUTION_CLAIM',
  'ACTOR','CAMPAIGN','INDICATOR','MALWARE','CVE','MITRE','TIMELINE_EVENT',
  'RESEARCH_NOTE','EVIDENCE','COUNTRY_NOTE'
 )),
 target_id uuid not null,
 relation_type text not null check(relation_type in (
  'GENERAL_RELEVANCE','REPORTED_TARGET','REPORTED_LOCATION','REPORTED_ORIGIN',
  'REPORTED_VICTIM_LOCATION','REPORTED_OPERATIONAL_AREA','MENTIONED_IN_SOURCE','OTHER'
 )),
 rationale text check(rationale is null or char_length(rationale)<=4000),
 created_by uuid not null references auth.users(id) on delete restrict default auth.uid(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 foreign key(project_id,investigation_country_id) references public.investigation_countries(project_id,id) on delete cascade,
 unique(project_id,investigation_country_id,target_type,target_id,relation_type)
);
create index investigation_country_links_target_idx on public.investigation_country_links(project_id,target_type,target_id);
create index investigation_country_links_country_idx on public.investigation_country_links(project_id,investigation_country_id,relation_type);

-- Existing private Evidence file metadata remains the sole file object.
create table public.fusion_attachment_links (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete cascade,
 evidence_id uuid not null,
 investigation_country_id uuid,
 country_note_id uuid,
 description text check(description is null or char_length(description)<=2000),
 created_by uuid not null references auth.users(id) on delete restrict default auth.uid(),
 created_at timestamptz not null default now(),
 foreign key(project_id,evidence_id) references public.evidence(project_id,id) on delete cascade,
 foreign key(project_id,investigation_country_id) references public.investigation_countries(project_id,id) on delete cascade,
 foreign key(project_id,country_note_id) references public.investigation_country_notes(project_id,id) on delete cascade,
 check(num_nonnulls(investigation_country_id,country_note_id)=1),
 unique(project_id,evidence_id,investigation_country_id,country_note_id)
);
create unique index fusion_attach_unique_country on public.fusion_attachment_links(project_id,evidence_id,investigation_country_id)
 where investigation_country_id is not null;
create unique index fusion_attach_unique_note on public.fusion_attachment_links(project_id,evidence_id,country_note_id)
 where country_note_id is not null;

-- Invoker validation means the underlying target table RLS remains effective.
create function public.fusion_validate_country_link()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare target_table text;
begin
 if not public.project_is_owned(new.project_id) or new.created_by is distinct from auth.uid() then
  raise exception 'not authorized' using errcode='42501';
 end if;
 if tg_op='UPDATE' and (new.project_id<>old.project_id or new.created_by<>old.created_by) then
  raise exception 'immutable ownership' using errcode='42501';
 end if;
 target_table:=case new.target_type
  when 'SOURCE' then 'sources'
  when 'SOURCE_ASSET' then 'source_assets'
  when 'SOURCE_NOTE' then 'source_notes'
  when 'ANNOTATION' then 'source_annotations'
  when 'SOURCE_CLAIM' then 'source_claims'
  when 'ATTRIBUTION_CLAIM' then 'source_attribution_claims'
  when 'ACTOR' then 'threat_actors'
  when 'CAMPAIGN' then 'campaigns'
  when 'INDICATOR' then 'indicators'
  when 'MALWARE' then 'malware'
  when 'CVE' then 'cves'
  when 'MITRE' then 'mitre_techniques'
  when 'TIMELINE_EVENT' then 'timeline_events'
  when 'RESEARCH_NOTE' then 'research_notes'
  when 'EVIDENCE' then 'evidence'
  when 'COUNTRY_NOTE' then 'investigation_country_notes'
  else null end;
 if target_table is null then raise exception 'unsupported target' using errcode='23514'; end if;
 if not exists(select 1 from public.investigation_countries c
   where c.id=new.investigation_country_id and c.project_id=new.project_id) then
  raise exception 'country not in investigation' using errcode='23503';
 end if;
 if not (select exists(select 1 from pg_catalog.pg_class where oid=('public.'||target_table)::regclass)) then
  raise exception 'invalid target type' using errcode='23514';
 end if;
 execute format('select exists(select 1 from public.%I where project_id=$1 and id=$2)',target_table)
 into strict found using new.project_id,new.target_id;
 if not found then raise exception 'target not found in investigation' using errcode='23503'; end if;
 return new;
end $$;
revoke all on function public.fusion_validate_country_link() from public,anon,authenticated;
create trigger fusion_validate_link before insert or update on public.investigation_country_links
 for each row execute function public.fusion_validate_country_link();

-- Remove stale polymorphic links on canonical record deletion, never delete their target material.
create function public.fusion_cleanup_country_links()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
 delete from public.investigation_country_links
 where project_id=old.project_id and target_type=tg_argv[0] and target_id=old.id;
 return old;
end $$;
revoke all on function public.fusion_cleanup_country_links() from public,anon,authenticated;
do $$
declare p text; record_type text;
begin
 for p,record_type in
 select * from (values
  ('sources','SOURCE'),('source_assets','SOURCE_ASSET'),('source_notes','SOURCE_NOTE'),
  ('source_annotations','ANNOTATION'),('source_claims','SOURCE_CLAIM'),
  ('source_attribution_claims','ATTRIBUTION_CLAIM'),('threat_actors','ACTOR'),
  ('campaigns','CAMPAIGN'),('indicators','INDICATOR'),('malware','MALWARE'),
  ('cves','CVE'),('mitre_techniques','MITRE'),('timeline_events','TIMELINE_EVENT'),
  ('research_notes','RESEARCH_NOTE'),('evidence','EVIDENCE'),
  ('investigation_country_notes','COUNTRY_NOTE')
 ) as refs(t,k)
 loop
  execute format('create trigger fusion_cleanup_link_after_delete after delete on public.%I for each row execute function public.fusion_cleanup_country_links(%L)',p,record_type);
 end loop;
end $$;

alter table public.investigation_countries enable row level security;
alter table public.investigation_country_notes enable row level security;
alter table public.investigation_country_links enable row level security;
alter table public.fusion_attachment_links enable row level security;
grant select,insert,delete on public.investigation_countries to authenticated;
grant select,insert,update,delete on public.investigation_country_notes to authenticated;
grant select,insert,update,delete on public.investigation_country_links to authenticated;
grant select,insert,delete on public.fusion_attachment_links to authenticated;

do $$
declare tbl text;
begin
 foreach tbl in array array['investigation_countries','investigation_country_notes','investigation_country_links','fusion_attachment_links'] loop
  execute format('create policy %I on public.%I for select to authenticated using(public.project_is_owned(project_id))',tbl||'_select_owned',tbl);
  execute format('create policy %I on public.%I for insert to authenticated with check(public.project_is_owned(project_id) and created_by=auth.uid())',tbl||'_insert_owned',tbl);
  execute format('create policy %I on public.%I for delete to authenticated using(public.project_is_owned(project_id))',tbl||'_delete_owned',tbl);
 end loop;
end $$;
create policy investigation_country_notes_update_owned on public.investigation_country_notes for update to authenticated
 using(public.project_is_owned(project_id) and created_by=auth.uid())
 with check(public.project_is_owned(project_id) and created_by=auth.uid());
create policy investigation_country_links_update_owned on public.investigation_country_links for update to authenticated
 using(public.project_is_owned(project_id) and created_by=auth.uid())
 with check(public.project_is_owned(project_id) and created_by=auth.uid());

comment on table public.investigation_country_links is 'Analyst-assigned country relevance. Not source attribution, targeting, or geographic fact without explicit relation semantics.';
