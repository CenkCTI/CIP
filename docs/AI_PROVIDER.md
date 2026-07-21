# Local Ollama AI Provider

Phase 6 supports only local Ollama through its OpenAI-compatible `/v1` API. AI settings are server-only: never use `NEXT_PUBLIC_` for AI values.

## Non-developer Linux setup
1. Install Ollama from the official Ollama source.
2. Choose a model that fits the machine RAM/GPU; there is no single model that fits every computer.
3. Pull the chosen model with Ollama and start Ollama.
4. Copy `.env.example` to `.env.local`.
5. Set `AI_ENABLED=true`, `AI_PROVIDER=ollama`, `AI_BASE_URL=http://127.0.0.1:11434/v1`, and `AI_MODEL` to the installed model name.
6. Keep `AI_API_KEY` blank for a local no-key Ollama instance.
7. Run the Next.js app locally and open the AI Workspace or `/api/ai/status`.

## Privacy and security boundary
The server re-fetches authorized project records, sends only whitelisted fields, treats all project text as untrusted data, validates JSON output with Zod, and requires explicit approval before saving. Usage logging stores metadata only.

## Vercel limitation
A Vercel function cannot reach a laptop-local `127.0.0.1` Ollama endpoint. Production should keep AI disabled unless the operator later supplies a separately secured reachable HTTPS OpenAI-compatible endpoint.
