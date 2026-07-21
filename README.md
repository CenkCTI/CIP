# Cyber Research OS

Cyber Research OS is a dark-first cyber research workspace built with Next.js, Supabase, and TypeScript.

## Setup for non-developers

1. Install Node.js 20+ and npm.
2. Copy `.env.example` to `.env.local` and fill in the Supabase values from your Supabase project.
3. In Supabase Auth, set the Site URL to `http://localhost:3000` for local testing and add your Vercel URL before production.
4. Apply the database migration: `psql "$SUPABASE_DB_URL" -f supabase/migrations/202607210001_phase1_foundation.sql`.
5. Run `npm install`, then `npm run dev`, and open `http://localhost:3000`.

## Commands

- `npm run dev` starts local development.
- `npm run lint` checks code style.
- `npm run typecheck` runs strict TypeScript.
- `npm test` runs unit tests.
- `npm run build` creates a production build.
- `npm run test:e2e` runs Playwright tests when live Supabase credentials are available.

## Vercel

Set `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in Vercel. Do not add service-role keys to frontend environments.

## Mutation pattern

Project create, update, and delete use Next.js Server Actions with Zod validation in `src/app/actions.ts`; reads are server-rendered with Supabase RLS enforcing ownership.

## Phase 2 Storage setup

Apply migrations in order, then verify that Supabase Storage contains a private bucket named `evidence`:

```bash
psql "$SUPABASE_DB_URL" -f supabase/migrations/202607210001_phase1_foundation.sql
psql "$SUPABASE_DB_URL" -f supabase/migrations/202607210002_phase2_workspace.sql
```

The Phase 2 migration configures the bucket as private with a 20 MB limit and MIME restrictions for PNG, JPEG, PDF, PCAP, LOG, and TXT evidence. Object paths are scoped as `{userId}/{projectId}/{uuid}-{sanitizedFileName}` and Storage RLS only allows authenticated project owners to read, upload, or delete their own project evidence objects.

## Phase 3 CTI relationship model

Cyber Research OS models CTI with project-owned Threat Actors, Campaigns, Indicators, Malware, CVEs, and MITRE Techniques. Semantic relationships are represented by explicit join tables rather than polymorphic links. Each join table includes `project_id`, the two entity IDs, `created_at`, a duplicate-safe unique pair constraint, and composite foreign keys back to `(project_id, id)` on both sides. This guarantees that relationships cannot connect records from different projects, while cascade delete removes orphaned relationship rows when an entity or project is deleted.

The Phase 3 UI adds project tabs for Actors, Campaigns, Indicators, Malware, CVEs, and MITRE Mapping. These tabs provide create, list, edit, delete, search/filter/sort, and multi-select relationship management backed by authenticated server actions and Zod validation.

Relationship edits are applied through the authenticated `replace_cti_relationships` RPC, which whitelists CTI module types, validates same-project membership for the parent entity and every related ID, deduplicates submitted IDs inside the transaction, and returns generic structured errors for invalid or unauthorized relationship changes.

## Phase 5 Reports and exports

Project Reports provide authenticated CRUD, a TipTap rich-text editor, insertion of real current-project records, Knowledge Graph Report nodes, and server-side PDF, Markdown, and standalone HTML downloads. Report content is stored as structured TipTap JSON; generated HTML escapes text and permits only supported nodes/marks and HTTP/HTTPS links. PDF generation uses `@react-pdf/renderer` in a Node.js route for Vercel-compatible real PDF bytes rather than browser screenshots or renamed HTML.
