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

## Phase 4

- [x] Additive migration authored for `public.entity_relationships`, database endpoint validation, RLS, duplicate/self-link constraints, indexes, updated_at trigger, and polymorphic cleanup triggers.
- [x] Protected graph endpoint returns typed nodes, semantic edges from all ten Phase 3 join tables, manual edges, deterministic global limits, dangling-edge prevention, and truncation metadata.
- [x] Project Knowledge Graph tab implemented with accessible legend, filters, search, deterministic/resettable layout, controlled node dragging, detail drawer, manual link creation, and manual edge edit/delete.
- [ ] Phase 4 migration applied to live Supabase database (blocked unless `SUPABASE_DB_URL` is configured in the execution environment).
- [ ] Browser acceptance against live Supabase for Knowledge Graph flows.

## Phase 5

- [x] Additive reports migrations authored for report schema, RLS, safe author assignment, REPORT graph enum support, graph validation, and delete cleanup.
- [x] Reports tab and edit route implemented with authenticated persistent CRUD, filters, dirty-state warning, and delete confirmation.
- [x] TipTap editor implemented with supported rich-text controls, strict versioned JSON validation, dirty-state protection, and structured JSON persistence.
- [x] Insert Project Data panel implemented for current-project workspace and CTI records.
- [x] Authenticated PDF, Markdown, and standalone HTML export routes implemented with safe filenames, structured TipTap rendering, controlled errors, and generated content.
- [x] Knowledge Graph extended with Report nodes, styles, detail links, manual relationships, and saved position validation.
- [ ] Phase 5 migrations applied to live Supabase database (blocked unless `SUPABASE_DB_URL` is configured in the execution environment).
- [ ] Browser acceptance against live Supabase for report editor/export flows.

## Phase 6 — Local Ollama AI Workspace
- Code added for server-only Ollama configuration/status, JSON validation, metadata usage limiting migration 012, project AI Workspace UI, generation routes, and explicit approval routes.
- Operator-reported prior live acceptance for Phases 1-5 is recorded separately from checks run in this environment.
- Migration 012 was authored but not applied in this container because no live Supabase connection was configured.
- Follow-up audit repaired MITRE approval to accept ATT&CK technique IDs, resolve them server-side to project-owned `mitre_techniques.id` values, and report linked/already-linked/rejected suggestions without trusting client UUIDs.
- Added executable Phase 6 regression tests for MITRE ID resolution, generation no-mutation/source whitelisting, six approval payloads, and client-side AI secret exposure checks.
- Live acceptance repair added migration 013 for AI usage-rate hardening after migration 012 was applied; migration 013 was authored but not applied in this Codex environment.
- Repaired live defects for indicator approval payloads/bulk approval, MITRE `technique_name` projections, report source projections, canonical translation approval source checks, and misleading cancel control copy.
- Live acceptance repair canonicalized Generate Report Draft source loading, hardened empty report draft validation, and blocked report generation/approval when no usable source or valid draft exists.

## Phase 7 — Public Demo and BYOK Cloud AI
- [x] Public synthetic `/demo` and `/demo/ai` routes added with clear no-persistence boundaries.
- [x] Fixed server-only BYOK provider registry added for OpenAI, OpenRouter, and Groq, while preserving local Ollama as a separate explicit provider.
- [x] AES-256-GCM temporary HttpOnly BYOK credential cookie implemented with user/guest binding and expiry.
- [x] Metadata-only guest session and usage migration 014 authored; not applied in this Codex environment because no live Supabase connection is configured.
- [x] Guest AI flow added with Turnstile-gated session creation, fixed pasted-text workflows, and no project persistence.
- [x] Authenticated AI workspace now exposes explicit Ollama vs connected BYOK selection without silent fallback.
- [x] Phase 7 PR repair added a shared accessible BYOK connection panel used by both guest demo AI and authenticated Project AI Workspace users.

- [x] Phase 7 PR repair moved the encrypted BYOK cookie to `Path=/api`, clears the legacy `/api/ai` path, and added safe generation error messages for missing/expired/mis-bound BYOK credentials.
