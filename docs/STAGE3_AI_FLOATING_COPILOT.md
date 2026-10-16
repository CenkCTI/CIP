# Stage 3 AI Copilot — Phase 2 (UI)

This stacked PR is based on `feat/stage3-ai-processing-core` (Phase 1 / PR #63). When Phase 1 is merged to main, rebase Phase 2 onto main and change its PR base. Do not merge it ahead of its dependency.

## Available in this PR

- Source Reader (PDF only) now has an **AI Copilot** button and a floating, draggable, resizable, minimizable and dockable panel, with a full-screen small-screen mode.
- Window geometry (no prompts, chat, API keys, or analysis data) is session-only in `citem:stage3-ai-window:v1`.
- Reuses the existing BYOK connection component and live `/api/ai/byok/status`. Stage 3 requests are enabled **only** for an NVIDIA NIM session.
- Explicit disclosure consent is required before sending selected source text externally. A connected provider may charge for use.
- Contexts are **current annotation**, actual visible **PDF page**, and **up to 10 consecutive pages**. Entire document (Phase 4) and Investigation-wide context are not represented as operational features.
- **ASK**, **ANALYSE**, and **Explain passage** call the existing Stage 3 read-only Processing endpoint. Recent conversation turns (at most three short Q/A pairs) may be sent as **untrusted conversational reference**, not as source proof. The server grounds all evidence against the same currently selected source excerpts.
- Response cards distinguish AI-generated overview, server-grounded quotations, source pages and outstanding questions. Citations jump to the PDF; annotation links focus the original source annotation.
- **No candidate extraction, research, record creation, or mutation.** Those remain in Phases 3–5.
- The conversation is client-memory only and is not saved. Moving to a different context does not authorize old context claims: only matching-context turns are forwarded as history.

## Acceptance

Run `npm test -- tests/stage3-ai-floating-copilot.test.tsx`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, plus authenticated NVIDIA PDF smoke on a preview environment. A running deployment and BYOK key are needed for the final live smoke.

Phase 1 migration 062 must be applied. Phase 2 makes **no new SQL changes**.
