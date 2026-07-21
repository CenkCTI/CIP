# Phase Status

## Phase 1
- [x] Next.js App Router foundation preserved and extended.
- [x] Supabase SSR clients, authentication pages, protected routes, and sign-out implemented.
- [x] Versioned Supabase migration authored for profiles, projects, triggers, indexes, and RLS policies.
- [x] Dashboard reads real project data for the authenticated user.
- [x] Project create, read, update, delete, search, filtering, and sorting implemented with server actions and Zod validation.
- [x] Unit tests added for validation and authorization-related helpers.
- [x] Phase 1 SQL migration applied in Supabase, manually verified by the repository owner on the live deployment at https://cip-omega.vercel.app.

## Phase 2
- [x] Versioned migration authored for workspace modules and private Evidence storage controls.
- [x] Project detail workspace implemented with real Notes, Evidence, Timeline, and Tasks CRUD.
- [ ] Phase 2 migration applied to live Supabase database (blocked unless `SUPABASE_DB_URL` is configured in the execution environment).
- [ ] Browser acceptance against live Supabase for Phase 2 workspace modules.

## Phase 3
- [x] Additive migration authored for CTI entities and all ten project-scoped semantic join tables.
- [x] Project CTI tabs and detail routes implemented for Threat Actors, Campaigns, Indicators, Malware, CVEs, and MITRE Mapping.
- [x] CTI relationship model documented in docs/RELATIONSHIPS.md.
- [ ] Phase 3 migration applied to live Supabase database (blocked unless `SUPABASE_DB_URL` is configured in the execution environment).
- [ ] Browser acceptance against live Supabase for Phase 3 CTI modules.

## Phase 4
- [x] Additive migration authored for `public.entity_relationships`, RLS, duplicate/self-link constraints, indexes, updated_at trigger, and polymorphic cleanup triggers.
- [x] Protected graph endpoint returns typed nodes, semantic edges from all ten Phase 3 join tables, manual edges, and truncation metadata.
- [x] Project Knowledge Graph tab implemented with accessible legend, filters, search, deterministic layout, detail drawer, manual link creation, and manual edge edit/delete.
- [ ] Phase 4 migration applied to live Supabase database (blocked unless `SUPABASE_DB_URL` is configured in the execution environment).
- [ ] Browser acceptance against live Supabase for Knowledge Graph flows.
