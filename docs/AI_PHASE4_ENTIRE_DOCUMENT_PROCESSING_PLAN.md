# CİTEM AI Phase 4 — Entire Document Processing & Processing Review Queue

**Status:** IMPLEMENTATION PLAN / DESIGN ONLY. No Phase 4 code is implemented by this document.
**Base:** main at Phase 3 PR #72 merge commit 4fa120047801d606e6cbf544caccee2dbc0d6517.
**Purpose:** Codex-ready design, implementation sequence and acceptance criteria for the AI Copilot's fourth development phase.
**Not the same as:** CİTEM's nine-stage intelligence-production **Stage 4 / Source & Information Evaluation**.

## 0. Source of truth, scope and decisions

The primary product specification is the uploaded Turkish planning note **Yapıştırılan metin(20261016-112716)(1).txt**, section **"FAZ 4 — Entire Document Processing ve Processing Review Queue"**, subsections 4.1–4.6 and **"PR-D — Whole Document Processing"**. Its central contract is:

    PDF → page text → page-aware chunks → NVIDIA extraction per chunk
        → validated candidates → deterministic server aggregation
        → analyst Processing Review Queue → normal Process/Extract → human Create/Link

The proposal below **preserves the original plan**: 6–8k-character chunks, deterministic chunk identity, client orchestration with initial concurrency 2, strict size limits, deduplication only for mechanical identities, a review/dismiss queue, optional bounded Investigation context, and no autonomous domain writes.

Sections explaining API payloads, failure states, resumability, candidate identity, security cases and merge gates are **implementation details proposed here** to make the original plan executable; they are not claims that the TXT specified those exact contracts.

**Phase 4 does not:** introduce Controlled Web Research (AI Phase 5), implement new AI providers, add OCR, promise persistent PDF-to-TXT caching, silently create Source Annotations, automatically save intelligence records, assess source reliability, infer truth, decide attribution, merge semantic claims, or produce a final intelligence assessment.

## 1. Starting point: merged Phase 3 vs missing Phase 4 capability

### Already available on main

- Source Reader with original-PDF assets, selected-page/annotation/document contexts, PDF.js text extraction, page-grounded spans and server-controlled source tokens.
- NVIDIA NIM BYOK, encrypted HttpOnly credential handling, model allowlist, authenticated project ownership and Stage 3 usage quota.
- **Analyse**, **Ask**, **Extract candidates**, validated candidate schemas and exact source-quote/token checks.
- Candidate kinds: SOURCE_CLAIM, INDICATOR, TIMELINE, MALWARE, CVE, MITRE, THREAT_ACTOR, CAMPAIGN, ATTRIBUTION_CLAIM, UNANSWERED_QUESTION.
- Review in Process handoff for supported candidate kinds, analyst-owned Create/Link and existing-record matching.
- Entire PDF **Analyse** in page batches with retry, progress, flagged-page review and quota pause. This is **not yet full-document candidate extraction**.
- The current candidate extraction endpoint is scoped to individual contexts, and Copilot candidate merging across requests is only provisional UI-level ID joining. It is **not** Phase 4 source-preserving deterministic aggregate/review.

### Phase 4 deliverable

One complete user action: **Extract from entire document**. The analyst can examine one bounded, provenance-preserving queue of suggestions covering all successfully processed chunks; no amount of AI output alone creates or links an intelligence record.

### User acceptance narrative

Given a 34-page Storm-0558 CSRB PDF, the analyst clicks **Entire PDF → Extract candidates**, sees a manifest/limit preflight, sees chunk progress and errors without false completion, then reviews a filterable document-level candidate queue. An exact CVE/IOC/ATT&CK identifier repeated across chunks appears as one candidate with **all original supporting occurrences available**. Distinct source claims and incidents remain separate until an analyst chooses otherwise.

## 2. Non-negotiable invariants

1. The project owner and source/asset ownership are verified on **every endpoint** and **every chunk**, not only when preparing a manifest.
2. Only READY, ORIGINAL, allowlisted PDF assets are processed. No client-provided raw PDF text, trusted source IDs, asset hashes, page claims, quotes, external URL or token-to-UUID mappings.
3. The server extracts original text, owns all token→source/page/asset mappings and verifies every accepted candidate quote against that same original-source span.
4. Only verified source-backed candidate entries may enter aggregation. Zero candidates is a valid outcome only if extraction completed and validated; malformed/unverifiable output is never a completed chunk.
5. AI route modules remain read-only with respect to intelligence-domain tables. Existing technical usage reservation/completion remains allowed.
6. Candidate identity/dedup is **not** a corroboration or confidence algorithm. Two sources saying the same thing do not become independent confirmation automatically.
7. The analyst must open the existing Process/Extract form, review and explicitly click its existing **Create** or **Link** action to persist domain records.
8. Model output is untrusted. Prompt-injection text inside PDFs cannot execute actions, alter policy or modify stored CTI records.
9. Partial completion, quota exhaustion, page failures and cancellation must remain visible and resumable; no "all pages analysed" claim for missing chunks.
10. Sensitive information (BYOK key, signed URLs, raw PDF bytes, full extracted text, unrelated Investigation data) never enters browser scan-session storage, API response diagnostics or AI usage metadata.

## 3. Proposed architecture

    Source Reader / Copilot
      ├── Existing Ask / Analyse / selected Extract (unchanged)
      └── New Document Extraction controller (client)
            |
            +→ POST prepare manifest (authenticated, source-bound, no AI call)
            |      ↓
            |   server-side PDF.js page text + deterministic chunk plan
            |      ↓
            |   safe metadata only: chunk IDs, page coverage, char counts, limits
            |
            +→ POST process one manifest chunk (max concurrent: 2)
            |      ↓
            |   reconstruct/validate asset-scoped chunk server-side
            |      ↓
            |   existing Stage 3 extract workflow + original quote verification
            |      ↓
            |   bounded verified candidate response + warnings
            |
            +→ Aggregate (server-owned deterministic rules)
            |      ↓
            |   filterable Document Processing Review Queue
            |      ↓
            |   Review in Process → normal form → analyst Create/Link

The Phase 3 page-batch **Analyse** controller and Phase 4 **Extract entire document** controller are separate modes. Do not silently reuse summary output as candidate data and do not issue one large NVIDIA request for the entire file.

### Boundary on repeated PDF extraction

The original TXT **explicitly defers a persistent extracted-text cache**. For v1, the prepare endpoint may scan the original PDF and the process endpoint may re-read/re-extract the requested pages or chunk from the owned asset. This is safe but not optimal; **PDF→TXT cache, OCR, persistent index, streaming model output and general provider routing belong to later optimization work**, not this PR. Measure source extraction time separately instead of claiming this design alone makes NVIDIA faster.

## 4. Chunk generation and identity

### 4.1 Exact configuration targets from the original Phase 4 note

| Configuration | Initial design value | Meaning |
|---|---:|---|
| AI_STAGE3_CHUNK_CHARS | 8,000 | Upper target per extraction chunk |
| AI_STAGE3_CHUNK_OVERLAP | 400 | Character overlap where a page must be split |
| AI_STAGE3_MAX_DOCUMENT_CHUNKS | 24 | Max chunks per whole-document scan |
| AI_STAGE3_DOCUMENT_CONCURRENCY | 2 | Initial simultaneous NVIDIA requests |
| AI_STAGE3_MAX_CANDIDATES | 150 | Maximum distinct review entries per scan |
| AI_STAGE3_MAX_SELECTED_PAGES | 20 | Range-scan limit |

These are **proposed config keys**, not assertions they exist on main. They must be validated server-side and clamped; never allow the frontend to raise them. Chunk target 6–8k is the source plan; use 8k with 400 overlap initially.

### 4.2 Planning rules

- Extract text per PDF page with existing PDF.js. Maintain original physical PDF page number; never infer or renumber pages from printed page labels.
- Build chunks in ascending page order, keeping page boundaries where possible; split a long individual page deterministically. Overlap only around a split boundary and record the overlapping source offsets.
- Preserve original raw/extracted wording for verification; normalization for display/chunk planning must not break exact-quote matching or provenance.
- Existing documentSpans/provenance token conventions must be reused or extended compatibly. Server source tokens remain DOC_Pnnn_Cnn (or current validated alias format); model-generated page/UUID fields are never authoritative.
- Chunk identifier proposed: SHA-256 of **original asset content hash + extraction/chunker version + page span/offset + ordinal**. **Do not** derive identity solely from model output or a mutable filename.
- Store/resolve asset hash securely from trusted asset metadata when available; otherwise compute server-side from original bytes. Version chunker settings so an altered extraction pipeline invalidates an old manifest.
- If more than 24 chunks are needed, return a clear **DOCUMENT_CHUNK_LIMIT** preflight result with count and option to select ≤20 pages or scan successive explicitly chosen sections. Do not sample first 24 chunks and claim full coverage.
- Empty/scanned/image-only pages are **TEXT_UNAVAILABLE** and specifically reported; never fabricate text or silently OCR.

### 4.3 Manifest shape (design contract, not yet coded)

    {
      scanVersion: 1,
      sourceId: "...", assetId: "...",
      assetFingerprint: "server-verified SHA-256 alias",
      pageCount: 34,
      chunks: [
        { chunkId: "...", ordinal: 1, pageStart: 1, pageEnd: 3,
          estimatedChars: 7814, state: "PENDING" }
      ],
      excludedPages: [],
      totalChunks: 18,
      maxCandidates: 150
    }

Manifest responses contain bounded metadata only. They must not return extracted text, private Storage paths, signed URLs, secret material, source database UUID mappings or model prompts. Browser-sent manifest fields are **hints**, not trusted authorization. Every process-chunk request must independently reconstruct or validate the exact chunk against the original PDF.

## 5. API and workflow contracts (proposed)

Use a narrow dedicated Stage 3 document processing module rather than growing the generic AI handler into an unrestricted tool runner.

### 5.1 API endpoints

| Route shape | Request | Response | Trust boundary |
|---|---|---|---|
| POST /api/projects/[id]/ai/processing/document/prepare | sourceId, assetId, whole/range selection | bounded scan manifest, coverage and limit errors | owner-scoped read + PDF extraction; **no model call** |
| POST /api/projects/[id]/ai/processing/document/chunk | sourceId, assetId, scanVersion, chunkId, consent | verified candidates, discarded/warnings, chunk result | owner recheck, source reconstruction, per-request quota + NVIDIA |
| POST /api/projects/[id]/ai/processing/document/aggregate | bounded validated scan result descriptors | merged review result + grouped/duplicate count | never trust client-provided "verified" claims; validate using server-backed signed/authenticated result references or reverify original source |
 
**Important design choice:** A client cannot assert that candidate quotations were verified and ask the server to merge them as authoritative. The implementation must use a **server-verifiable** bounded result reference, or perform server-side re-verification before aggregation. If this is not supportable without a new database table, keep aggregation **deterministic client-side for presentation only**, backed by server-verified per-chunk responses, and explicitly label it presentation aggregation; do not introduce an uncontrolled storage/mutation path. Choose and test one safe approach before implementation. This decision is an implementation design gate.

### 5.2 Authentication and request schema

- Existing requireOwnedProject gate; validateOrigin; validated bounded JSON; strict Zod; explicit BYOK consent; NVIDIA-only in v1.
- Reject mismatched source/project/asset, wrong asset role/state, stale asset fingerprint, unsupported source type, negative page ranges, invalid chunk ID and cross-owner access.
- Chunk processing receives **only opaque selectors**. Never accept client-authored excerpt text, model prompt, original PDF bytes or source proof.
- Return fixed diagnostic codes, stage, chunkId and safe counts. Never expose raw provider error bodies, key, PDF source excerpt or signed URL in error telemetry.
- Standardize typed errors for limit, quota, source, extraction, token verification and malformed model output.

### 5.3 Per-chunk execution

1. Read/validate owned PDF and exact chunk identity.
2. Reconstruct server-controlled page-aware text spans and token aliases.
3. Reserve Stage 3 usage atomically **before NVIDIA work** using current quota RPC.
4. Call existing runStage3CandidateExtraction with source spans; reuse its Zod and exact-quote gates.
5. Keep only source-verified candidate objects; per-candidate invalid token/quote or unsupported typed value is discarded.
6. Return verified candidates and warnings. If the model returns valid empty candidates, record **COMPLETE_NO_CANDIDATES** rather than failure.
7. Include bounded provenance sufficient to navigate exact PDF pages, not unconstrained entire document text.
8. Never call Process/Extract mutation actions or update CTI domain tables.

### 5.4 Retry policy and quota integration

The current quota is **30 Stage 3 request reservations / 1,200,000 input characters per rolling 60 minutes**, shared with earlier AI processing modes. **Do not** assume 24 chunks always fit alongside previous requests, retries and quota-consuming other Copilot actions.

- Preflight displays estimated chunk count and **estimated** request budget; it cannot guarantee available quota.
- Start with concurrency 2 **only if** the server can enforce reservation under simultaneous requests; the existing atomic quota RPC remains authoritative.
- If 429 stage=quota, **pause the scheduler**, preserve completed chunks, do not automatically rerun the rest, show Continue action.
- If NVIDIA rate-limits, timeouts or is unavailable, pause or mark recoverable without claiming processed; use bounded user-approved retry, never unbounded exponential fan-out.
- Invalid model output gets at most the already approved bounded repair attempt; avoid recursively splitting an entire document to isolated pages unless there is evidence chunk text is too dense. The user must see cost and failure count.
- Cancellation aborts outstanding client fetches; an already-completed server request may still be charged, and a client abort does **not** guarantee the provider stopped or that a reservation was reversed.
- Never bypass or delete usage ledger entries to make a scan "unlimited."

## 6. Candidate verification and aggregation

### 6.1 Verification before aggregation

Reuse the merged Phase 3 candidateKind, stage3CandidateResponseSchema and verifyStage3Candidates contract. A raw AI suggestion is **NOT_SAVED** and cannot be promoted by a UI state change into a domain record.

Each accepted candidate must have:
- validated kind-specific structure and derivation (EXTRACTED/NORMALIZED/MAPPED);
- ≥1 exact quote that appears in a server-owned original source span;
- server-mapped PDF page, asset and Source provenance;
- warnings/caveats, including disputed/qualified original source statements.

Keep ungrounded candidates **out of the queue**; report discarded count separately. Never treat substring validation alone as proof that every candidate interpretation is semantically sound: retain analyst review.

### 6.2 Deterministic duplicate rules from original plan

| Kind | May auto-consolidate? | Key | Preservation rule |
|---|---|---|---|
| INDICATOR | **Yes**, only normalized exact identity | indicator type + canonical value | Keep all unique original page/quote occurrences |
| CVE | **Yes** | canonical uppercase CVE ID | Retain every exact-source support |
| MITRE | **Yes**, if exactly same technique ID | canonical ATT&CK technique ID | Keep each supporting behavior/explanation distinct for review |
| SOURCE_CLAIM | **No** | never semantic auto-merge | Show optional **Possible overlap**, analyst decides |
| TIMELINE | **No** | no semantic/time similarity merge | Keep separate, even with same date |
| CAMPAIGN | **No** | no semantic overlap merge | Identity suggestion only; analyst decides |
| THREAT_ACTOR, MALWARE | **No autonomous semantic identity merge** | conservative existing-record matches only | Do not conflate aliases without review |
| ATTRIBUTION_CLAIM | **No** | source-reported attribution positions remain distinct | Never turn mention into attribution |
| UNANSWERED_QUESTION | **No required auto-merge** | optional grouping only | Keep distinctions visible |

- Stable aggregated ID is computed deterministically from candidate kind/canonical identifier and scan context; must not rely on React list position.
- Dedup affects **review presentation**, not source-position records or evidence count. Multiple quotes do not imply multiple independent confirmations.
- Union all distinct provenance occurrences in each exact-identity group, including original page/quote links. Display the first few in UI but disclose/allow navigation to the full bounded set; never silently throw away supporting pages.
- If the 150-review-entry ceiling is reached, show **CANDIDATE_LIMIT_REACHED** and scan coverage, stop/require analyst refinement rather than silently truncate or auto-save overflow.
- Existing project-scoped deterministic matching is reused **after extraction**, not by dumping all actors/campaigns/claims into NVIDIA. MatchStatus UNAVAILABLE stays visible.

### 6.3 Suggested aggregate result (design shape)

    {
      scanId: "local opaque session ID",
      coverage: { totalChunks: 18, completed: 17, failed: 1, pending: 0 },
      counts: { sourceClaims: 22, indicators: 31, ... },
      items: [{
        reviewId: "deterministic identity",
        kind: "INDICATOR",
        canonicalValue: "...",
        status: "NOT_SAVED",
        occurrences: [{ chunkId: "...", sourceToken: "...",
                        page: 11, quote: "...", provenance: {...} }],
        possibleMatches: []
      }],
      reviewRequired: true
    }

**Never** derive finished coverage from number of candidate cards: some successfully scanned chunks legitimately have zero candidates.

## 7. Analyst Processing Review Queue UX

This is **a separate view within the existing Copilot/Source Reader**, not a second generic chatbot and not a new intelligence-production Stage 4 screen.

    DOCUMENT PROCESSING REVIEW
    Document: Storm-0558 CSRB Report
    17 / 18 chunks verified | 1 failed | 54 suggestions | NOT SAVED

    [All] [Source Claims] [IOC] [Timeline] [MITRE]
          [Malware] [CVE] [Actors] [Campaigns]
          [Attribution Claims] [Unanswered Questions]

    SOURCE CLAIM — source statement + page citations
      Derivation, stance, caveats, origin, matching status
      [Dismiss] [Review in Process]

    INDICATOR — canonical indicator + multiple occurrences
      Page 5, Page 8, Page 11  |  Existing match?
      [Dismiss] [Review in Process]

### 7.1 Required controls

- **Extract entire document**, **Selected range**, **Cancel**, **Continue**, **Retry failed chunks** (bounded), **Review in Process**, **Dismiss**.
- Progress uses **chunks verified / total chunks**, a separately displayed count of no-candidate chunks, pending/failed/needs-review chunks and candidate totals. Never conflate the Phase 3 **pages processed** label with these semantics.
- Counts and filters cover every Stage 3 candidate kind; count after deterministic exact-ID dedup and show raw occurrences separately if useful.
- Candidate detail exposes original quote and PDF page navigation; show source-reported qualifications and visible **AI suggestion · NOT SAVED** label.
- For possible Source Claim overlap, show a non-authoritative suggestion group, not a one-click merge.
- Dismiss changes only ephemeral review state; never deletes a domain record and never prevents source read.
- Review in Process uses existing safe prefill and preserves editing/review before the final Create/Link.
- When quote is not covered by an existing annotation, navigate to the passage and instruct the analyst to annotate; **do not** silently manufacture an annotation.
- After the normal form confirms a successful Create/Link, the queue may display **Reviewed / Saved via analyst action**, but may not infer success from opening the form.
- Keep existing floating/dockable Copilot interaction accessible; no independent wizard that blocks revisiting Source Reader.

### 7.2 Useful statuses

- SCANNING; PAUSED_QUOTA; PAUSED_PROVIDER; CANCELLED; COMPLETE; COMPLETE_WITH_GAPS; LIMIT_REACHED.
- Each chunk: PENDING; RUNNING; COMPLETE_WITH_CANDIDATES; COMPLETE_NO_CANDIDATES; FAILED_RETRYABLE; FAILED_FINAL; TEXT_UNAVAILABLE.
- A **complete** scan means all manifest chunks received a validated completion, including legitimate no-candidate chunks. **Complete with gaps** is explicit if any chunk is absent or unverified.

## 8. Investigation context and matching

Original plan option:

    [ ] Include Investigation context

For v1 this means **candidate-specific, project-scoped targeted matching after extraction**, not bulk injection of Investigation notes and domain records into model prompts.

- Reuse Stage 3 matching for indicators, CVEs, MITRE, malware, actors, campaigns and possible Source Claim similarities.
- Resolve missing match queries lazily or in bounded server batches, with strict allowlisted SELECT columns and ≤5 matches per candidate.
- Preserve distinctions **EXACT**, **POSSIBLE**, **UNAVAILABLE**; possible claim similarity never auto-merges.
- Future expansion to model-facing Investigation excerpts requires its own consent, policy and data minimization review. Do not silently send full DB data because the checkbox is enabled.
- Scope all lookups to project owner/project ID; no cross-Investigation query and no leakage of unrelated records.

## 9. Session resume, limits and source-version safety

The original planning note allows React state and sessionStorage for session context, candidate summaries, dismissed IDs and document scan progress, **not** credentials, PDF content or signed URLs.

Proposed v1:
- Active scan held in client state; bounded optional same-tab sessionStorage snapshot contains only scan selectors, chunk IDs/states, small verified candidate summaries, IDs, dismissed IDs and bounded citation metadata — **no full source text or raw PDF**.
- Session key includes projectId/sourceId/assetId + scanVersion and owner binding. Never blindly trust sessionStorage on restore.
- On restore, recheck server session, source/asset ownership, **asset fingerprint**, chunker version and model/language policy before allowing further processing.
- A changed original PDF, deleted asset, altered chunker version or changed owner invalidates the old scan and asks for restart.
- A refresh may need reconstruction/reverification of any stored summaries if the server does not issue signed result references; restored client data is never accepted as server-verified input to a write.
- Limit total storage size; if exceeded, degrade to in-memory-only and state that refresh may lose progress. Provide a clear "Discard scan" control.
- Phase 4 implementation may use ephemeral server-side technical scan-result records only after a separate schema/security review. Do not create hidden persistent CTI data or rely on shared Vercel process memory.

## 10. Security and privacy review

### Existing controls to preserve

- Service role key remains server-only; user BYOK key stays encrypted HttpOnly and is never delivered to the client or model payload.
- Source/asset/annotation reads use authenticated owned-project filters. No cross-owner source, arbitrary signed URL or file-path fetch.
- PDF content is **untrusted data**; prompt injection cannot call tools, approve candidates or save records.
- Accepted citations must resolve to the original source span; any claimed model page or UUID is ignored.
- Technical usage ledger may record counts/status, not raw source texts or model completions.

### Negative tests

1. Project A cannot prepare or process chunks from Project B.
2. Changing sourceId, assetId, source role, chunkId, offset or fingerprint yields a controlled rejection.
3. An opaque chunkId cannot be replayed against another PDF or processing version.
4. Manifest tampering cannot trick the server into sending attacker-supplied text to NVIDIA.
5. Model-invented source tokens, quotes, CVEs, ATT&CK IDs or attribution statements are rejected.
6. A "source" paragraph instructing the AI to save records is treated as data.
7. No Stage 3 AI route imports existing domain mutations; **before analyst Create/Link, zero domain records change**.
8. SessionStorage cannot contain API key, full PDF, signed Storage URL or full document text.
9. Cancelling/closing a scan cannot create partial domain mutations.
10. Provider errors, rate-limit errors and unexpected JSON failures cannot mark chunks complete.
11. Server response logs/diagnostics never reveal raw provider responses or private content.
12. Test for existing annotation mismatch to prevent linking a verified quote to an unrelated annotation.

## 11. Implementation workstreams (one feature PR after this docs-only plan)

### Workstream A — Manifest and chunk substrate

**Files (proposed):**
- src/lib/ai/stage3/document-manifest.ts — deterministic page-aware segmentation and limits.
- src/lib/ai/stage3/document-chunk-identity.ts — stable SHA-256 identity and source version.
- src/lib/ai/stage3/document-types.ts — manifest/chunk status and strict schemas.
- src/app/api/projects/[id]/ai/processing/document/prepare/route.ts — preflight manifest endpoint.
- Unit tests: chunk coverage, overlap/no gaps, huge-page split, page ordering, max24 and fingerprint invalidation.

**Done when:** A 34-page PDF yields a deterministic **complete** coverage manifest, no model invocation or source-text leak, and an oversized PDF fails with explicit options rather than being silently cut.

### Workstream B — Safe chunk extraction and quota

**Files (proposed):**
- src/app/api/projects/[id]/ai/processing/document/chunk/route.ts.
- Reuse src/lib/ai/stage3/context.ts, provenance.ts, candidate-workflow.ts, candidates.ts, usage-quota.ts and BYOK client.
- Tests: auth, ownership, stale chunk, schema invalidity, quote checks, no-candidate valid outcome, quota pause, provider failure and abort.

**Done when:** Server produces only source-supported candidates for one validated chunk, returns typed completion and consumes the existing quota safely; no CTI domain mutation.

### Workstream C — Deterministic document-level aggregation

**Files (proposed):**
- src/lib/ai/stage3/document-aggregation.ts — canonical exact-key aggregation with unioned provenance.
- Optional secure aggregate endpoint only after the server-validation design gate in §5.1.
- Tests: same IOC/CVE/MITRE merged; distinct Source Claim/Timeline/Campaign/Attribution positions **not merged**; retained multiple original citations; limit150 and idempotent repeated chunk response.

**Done when:** Repeated exact mechanical identifiers become one review item without losing source locations or conflating analytical propositions.

### Workstream D — Client orchestration and Review Queue

**Files (proposed):**
- src/components/investigations/source-reader/ai/document-scan-controller.ts (or hook).
- src/components/investigations/source-reader/ai/document-processing-review.tsx.
- Small integration in existing processing-copilot.tsx / copilot-candidates.tsx.
- Tests: concurrency max2, progress, limit preflight, cancellation, paused/resume, explicit failed chunks, session restore, filter counts, navigation, Dismiss, Review in Process and Create/Link separation.

**Done when:** The analyst can process an entire supported document, review source-linked candidates and explicitly save through the unchanged normal form.

### Sequence and review checkpoints

1. A (manifest) → unit/security gate.
2. B (verified extraction) → API + quota + no-write gate.
3. C (aggregation) → dedup/provenance gate.
4. D (Review Queue and full E2E) → release gate.

The original plan envisages this as **PR-D / one coherent Phase 4 implementation PR**, not fifteen small PRs. This new docs PR is an **independent blueprint**; a later implementation PR will use the plan after review. Do not merge it automatically with Phase 3's now-merged PR #72.

## 12. Acceptance gates (merge blockers for actual Phase 4 code)

### Automated

- npm run lint
- npm run typecheck
- npm test
- npm run build
- Explicit database migration validation **only if** a migration is introduced; default design should not require new CTI schema.
- Unit: deterministic chunk coverage (zero missing or repeated non-overlap positions), stable SHA identities, 6–8k / overlap400, 24-chunk cap, 20-page selected-range cap, 150 candidate cap.
- Unit: canonical indicator/CVE/MITRE dedup, source-support union and rejection of semantic Source Claim/Timeline/Campaign merges.
- Unit/API: strict Zod and quote/token validation, owner isolation, prompt-injection fixtures, empty candidate success and malformed output failure.
- Client: concurrency ≤2, cancellation, quota pause, targeted retry, session restore version rejection, full queue filters, source navigation, dismiss and Review in Process.
- End-to-end: candidates cannot persist before the analyst clicks Create/Link; after explicit confirmation the existing domain record and provenance appear.
- Security: verify no domain server actions or mutation calls from AI prepare/chunk/aggregate routes.

### Authenticated real-NVIDIA acceptance

1. Use the **34-page Storm-0558 CSRB PDF** (or similarly mixed-content PDF), with real project owner and NVIDIA BYOK.
2. Prepare manifest; check page 1–34 fully represented by a bounded set of chunks or explicitly blocked by correct limit messaging.
3. Execute chunk extraction; verify source-backed SOURCE_CLAIM/TIMELINE/IOC/etc. candidates are not summaries disguised as candidates.
4. Confirm no valid IOC/CVE/ATT&CK identifiers are invented where not actually in quoted text.
5. Validate repeated exact candidates aggregate with all their original PDF page citations.
6. Validate distinct report positions and qualified 2021 key-compromise hypotheses are not collapsed into confident attribution.
7. Check a failed chunk doesn't turn the document "Complete"; the user can resume without rerunning successful chunks.
8. Test quota limit and user-cancel behavior; provider usage and CI-tested resumability match the visible state.
9. Confirm no domain CTI write when generating/dismissing/reviewing cards; only existing form Create/Link writes.
10. Inspect latency, extraction time, NVIDIA call count and quote rejection rates as **baseline measurements**, not a performance SLA.

**Do not claim production-ready solely because CI is green or Vercel Preview builds.** Keep implementation PR Draft until authenticated NVIDIA and DB owner-isolation / no-write acceptance is documented.

## 13. Deferred backlog / explicit non-goals

- **AI Phase 5:** Controlled Web Research; search-provider abstraction, user-approved queries, safe HTTPS fetch, web provenance, Add-to-Collection handoff and SSRF/prompt-injection threat model.
- Later: persistent PDF-to-TXT / OCR / page text cache, provider routing beyond NVIDIA NIM, response streaming, query retrieval/indexing, deeper claim-to-evidence semantic verification, smarter contextual extraction and latency optimization.
- Intelligence-production **Stage 4**: source reliability and information credibility; **Stage 5**: operational picture; **Stage 6**: hypothesis/evidence role; analyst judgments do not migrate into this AI Phase 4.
- No automatic Campaign reconstruction, final actor attribution, intelligence product publication, report dissemination or cross-Investigation learning in this Phase 4.

## 14. Definition of done

Phase 4 implementation is done **only when** all of the following hold:

- [ ] Entire-document **Extract candidates** independently works beyond the existing page-batch **Analyse** mode.
- [ ] Every requested extractable page has explicit manifest coverage or an explicit exclusion/failure.
- [ ] Candidate source support, page locations and provenance survive chunk verification and aggregation.
- [ ] Only IOC/CVE/MITRE exact mechanical duplicates consolidate automatically.
- [ ] Review Queue filters, Dismiss, PDF navigation and analyst Review in Process operate end to end.
- [ ] Resume/cancel/quota/partial states are honest and regression-tested.
- [ ] Every CTI domain write still requires the original form's analyst Create/Link.
- [ ] CI, negative security tests and authenticated NVIDIA E2E have passed.
- [ ] Remaining gaps and optimizations are documented without inflating "Complete" status.

**Implementation authorization:** This document is only an executable plan; do not implement or merge Phase 4 application code as part of this documentation PR.
