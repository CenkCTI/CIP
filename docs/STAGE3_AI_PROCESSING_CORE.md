# Stage 3 AI Processing Core — PR-A

## Scope

This PR implements the read-only Stage 3 Processing service before any floating UI, Process / Extract handoff, whole-document batch pipeline or web research. It reuses NVIDIA NIM BYOK credentials and Supabase's existing AI usage quota RPC.

`POST /api/projects/[id]/ai/processing` accepts JSON:

```json
{
  "sourceId": "<owned source UUID>",
  "assetId": "<ready original PDF asset UUID>",
  "context": { "kind": "annotation", "annotationId": "<owned annotation UUID>" },
  "mode": "analyse",
  "byokConsent": true
}
```

The `context` can also be `{"kind":"page","page":5}` or `{"kind":"pages","pageStart":5,"pageEnd":6}`. `mode:"ask"` requires a bounded `question`. The frontend sends IDs only; source text, URL, PDF bytes and API key are loaded server-side, never accepted as authoritative client inputs.

## Security and semantic boundaries

- Project, source, asset and annotation are scoped at every DB read to the authenticated investigation owner.
- The Stage 3 gateway is allowlisted to SELECT queries and PDF Storage downloads. The provider call has no DB or mutation tools.
- Original READY PDF assets only. No OCR. Page text is extracted server-side with existing pdfjs-dist and strict byte/context budgets. Entire-document scanning is reserved for PR-D.
- Every model-facing excerpt has an alias token, not a database UUID. Page metadata and DB provenance are resolved exclusively by the server.
- Unknown tokens or unsupported quotations are repaired once or discarded. No source-backed evidence is silently invented. Text from sources is untrusted data, including embedded instructions.
- AI is not allowed to record a source claim, assign attribution, assess source reliability or create an IOC. The response is only provisional text and grounded evidence.
- The encrypted HttpOnly BYOK cookie is bound to the authenticated user; only the NVIDIA NIM provider and its validated model allowlist are accepted.
- Usage reservations and completion events are **technical quota metadata only**, not intelligence domain writes. Migration 062 extends the allowlist to `stage3_processing`.
- JSON responses use no-store caching and require origin validation.

## Delivery gates

PR-A is intentionally unmerged. Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and PostgreSQL migration acceptance against the existing AI usage schema (requires a configured test database). The unit suite covers invalid source tokens, fabricated quotes, JSON repair, scope and prompt injection. Cross-project and credential behavior also need authenticated live acceptance before production activation.

Follow-up PRs: B UI, C candidate/handoff, D entire document, E approved web research/SSRF hardening.
