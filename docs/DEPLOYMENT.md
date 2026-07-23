# Deployment

Apply Supabase migrations `001` through `012`, configure Auth redirects to the deployed site, set storage bucket/RLS policies from the migrations, and set only placeholder-safe environment values in GitHub/Vercel.

For Vercel production, leave `AI_ENABLED=false` unless a secured reachable provider exists. `http://127.0.0.1:11434/v1` works only when Next.js and Ollama run on the same local Linux machine; in Vercel it points at the Vercel runtime, not the operator laptop.

Run `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm audit --audit-level=high`, and Playwright only with live Supabase credentials and browser dependencies.
