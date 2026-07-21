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
