# Cyber Research OS Agent Notes
- Stack: Next.js App Router, strict TypeScript, Tailwind CSS, Supabase Auth/Postgres/Storage, @supabase/ssr, @supabase/supabase-js, Zod, npm, Vitest/RTL, Playwright.
- Commands: `npm install`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e` when live Supabase credentials and a runnable app are available.
- Security: never commit secrets or `.env`; never use Supabase service-role keys in browser code; validate mutations server-side; enforce auth and ownership server-side and with RLS.
- Every visible action must have real behavior. Do not add placeholder CRUD, fake persistence, or clickable buttons without handlers.
