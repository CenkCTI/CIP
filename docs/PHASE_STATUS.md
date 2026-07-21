# Phase Status

## Phase 1
- [x] Next.js App Router foundation preserved and extended.
- [x] Supabase SSR clients, authentication pages, protected routes, and sign-out implemented.
- [x] Versioned Supabase migration authored for profiles, projects, triggers, indexes, and RLS policies.
- [x] Dashboard reads real project data for the authenticated user.
- [x] Project create, read, update, delete, search, filtering, and sorting implemented with server actions and Zod validation.
- [x] Unit tests added for validation and authorization-related helpers.
- [x] Phase 1 SQL migration applied in Supabase, manually verified by the repository owner on the live deployment at https://cip-omega.vercel.app.
- [x] Real account registration, sign-in, and sign-out manually verified by the repository owner on the live deployment.
- [x] Project create, read, edit, delete, persistence after refresh/re-sign-in, and real dashboard counts manually verified by the repository owner on the live deployment.
- [x] Cross-user project isolation manually verified by the repository owner: a second user cannot see or directly access the first user's project.
- [x] Production Vercel deployment manually verified by the repository owner.

## Phase 2
- [x] Versioned migration authored for research notes, evidence metadata, timeline events, project tasks, private `evidence` Storage bucket restrictions, indexes, triggers, and RLS policies.
- [x] Project detail workspace implemented with Overview, Research Notes, Evidence, Timeline, and Tasks tabs backed by authenticated server mutations.
- [x] Direct signed evidence upload flow implemented without service-role keys, with metadata finalization, orphan cleanup on finalization failure, file replacement safety, and private signed download URLs.
- [x] Edit UI implemented for Research Notes, Evidence, Timeline Events, and Tasks.
- [ ] Phase 2 migration applied to live Supabase database (blocked unless `SUPABASE_DB_URL` is configured in the execution environment).
- [ ] Browser acceptance against live Supabase for Phase 2 workspace modules.


## Phase 3
- [x] Additive migration authored for CTI entities, relationship tables, constraints, indexes, updated_at triggers, authenticated-scoped RLS policies, and atomic relationship replacement RPC.
- [x] Project CTI tabs and detail routes implemented for Threat Actors, Campaigns, Indicators, Malware, CVEs, and MITRE Mapping with authenticated create, list, detail, edit, delete, search/filter/sort, validation, and searchable relationship controls.
- [x] CTI relationship model documented in README.md and docs/RELATIONSHIPS.md.
- [ ] Phase 3 migration applied to live Supabase database (blocked unless `SUPABASE_DB_URL` is configured in the execution environment).
- [ ] Browser acceptance against live Supabase for Phase 3 CTI modules.
