# CİTEM AI Phase 5 — Controlled Web Research

Basis: the original Turkish planning TXT, FAZ 5, PR-E. This is not intelligence-production Stage 5.

## Implemented in PR #77

- NVIDIA suggests 1–3 targeted queries from an analyst-selected PDF page/range/annotation; no search runs during suggestion generation.
- The analyst approves individual queries and explicitly presses Search selected. Provider-independent ResearchSearchProvider is backed by the fixed Brave Search API endpoint.
- Only the server may access BRAVE_SEARCH_API_KEY. Missing credentials return HTTP 503 search_not_configured. This is independent of NVIDIA BYOK.
- Selected external pages are fetched by a public HTTPS-only, DNS-verified, IP-pinned reader; private/local hosts, IP literals, HTTP, credentials, unsafe redirects, nonallowlisted media, over-sized responses and timeouts are rejected.
- No cookies, authenticated web sessions, JavaScript execution or browser automation. HTML/plain/PDF text extraction is bounded.
- WEB_001 tokens associate quote excerpts with the server-fetched URL, title, domain and retrieval timestamp. Model quotes are matched to actual text. Attribution and independent corroboration remain analyst decisions.
- Add to Collection opens the existing Stage 2 Source URL form with editable URL, title, publisher and rationale. The analyst explicitly saves the Source. Research routes cannot mutate intelligence-domain tables.
- Every endpoint checks owned-project access, strict request schemas and existing AI usage quotas. Results and intermediate text remain ephemeral.

## Preview setup and acceptance

1. Provision BRAVE_SEARCH_API_KEY securely on the Vercel Preview project; never expose it through NEXT_PUBLIC_ variables.
2. Connect NVIDIA NIM BYOK, select a source page/annotation and enter a specific research question.
3. Click Suggest searches; verify no web search was performed. Choose checkboxes and click Search selected.
4. Review external leads; Read with AI only after explicit analyst selection. Inspect WEB_001 quote provenance and uncertainties.
5. Click Add to Collection and verify the ordinary Stage 2 URL Source form opens with editable prefilled metadata and does not automatically submit.
6. Run negative tests for private IP, mixed DNS, redirects to private ranges, oversize, timeout, injection, forged source IDs, and provider outages.

## Deferred and merge blockers

- A real Brave API key is required for live search. This adapter is replaceable; free and unlimited third-party search is not promised.
- Web search snippets are not evidence, and a valid quote is not sufficient to corroborate its interpretation.
- Client session state is not persisted. No OCR, general autonomous browsing, authenticated fetching, automatic source saving or source credibility scoring.
- Run lint, typecheck, Vitest, Next build, security review, authenticated Brave/NVIDIA acceptance and manual Stage 2 Create Source before merging.
