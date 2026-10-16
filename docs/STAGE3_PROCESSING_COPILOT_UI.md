# Stage 3 Processing Copilot — PR-B (Phase 2)

## Scope

This phase adds a usable floating **AI Processing Copilot** to the CİTEM Source Reader for owned PDF sources. It depends on PR-A's read-only `/api/projects/[id]/ai/processing` endpoint. No intelligence-domain writes or new SQL migrations are introduced.

Open `/projects/[id]/sources/[sourceId]` and choose **AI Copilot**. The panel:

- Is draggable and resizable on desktop (default 440 × 620); minimizable, dockable and dismissible; mobile uses a full-screen sheet.
- Persists **window geometry only** to `sessionStorage["citem:stage3-ai-window:v1"]`.
- Reuses the existing NVIDIA NIM BYOK connection panel, HttpOnly session cookie, and connection status endpoint.
- Offers entire PDF by default, current text annotation, active PDF page, and selected 1–10 consecutive pages. Investigation-wide context is intentionally out of scope.
- Sends only selected project/source/asset/annotation identifiers and question to the Phase 1 API; the server is authoritative for the PDF contents and source metadata.
- Displays returned grounded evidence with clickable page citations, unanswered questions, caveats and errors. Citation selection scrolls the existing PDF viewer to the correct page.
- Supports Ask, Analyse context and Explain passage. Structured candidate extraction/handoff and external research remain later-phase capabilities.
- Keeps the visible chat transcript **in React memory only**. Up to three bounded Q/A pairs from exactly the same annotation/page/page range may be sent as **untrusted conversational reference** for follow-up questions. Old answers cannot provide source evidence and nothing is persisted; all evidence in every response is re-grounded to the currently selected PDF text.
- Makes explicit that selected source text is sent to NVIDIA when the user submits a question; the provider can charge usage. API credentials are never stored in React transcript or browser storage.

## Required acceptance

- Targeted UI and Phase 1 tests, lint, typecheck, full suite, build.
- Real browser: source PDF with known p.5 content, 1-page/2-page queries, annotation selection, rejected scanned page and source citations.
- NVIDIA NIM BYOK test with the configured environment, project owner session and valid connection.
- Verify mobile sheet, drag/resize/dock/minimize and keyboard dismiss.
- Confirm domain mutations still require analyst-originated Process / Extract forms.

## Dependency / merge order

At creation GitHub still showed **PR #63 Phase 1 open, not merged into main**. PR-B targets `feat/stage3-ai-processing-core` to avoid dropping its dependency. Merge PR-A into `main` first, then retarget PR-B to `main` and review the reduced diff. Do not squash PR-B into `main` before PR-A is available.

## BYOK-to-send fix

The original BYOK connect endpoint returned `connected`, `provider` and `model` but omitted `providerId`; the Copilot required `providerId === "nvidia_nim"` to enable Ask. This PR updates the server connect response and existing panel to expose the stable ID, and accepts the exact `NVIDIA NIM` display name only when ID is absent for backward compatibility. `tests/stage3-ai-byok-connect-chat.test.tsx` exercises the real connection panel and subsequent POST on the same screen, including a legacy connect response.

## Diagnosing live request failures (Phase 2 fix)

If the Copilot displays an error, the UI now includes **HTTP status**, a coarse **stage**, and a public **code**. Neither the UI nor logs reveal the NVIDIA API key, the Supabase error body, the source content, or raw provider responses.

- `stage=source`: verify the selected asset is a READY original PDF, source ownership, source-assets Storage access and extractable PDF text.
- `stage=quota`: inspect the Stage 3 AI usage quota migration `202610160062_stage3_processing_ai_usage.sql` and authenticated RPC grants.
- `stage=nvidia`, `code=provider_error`: NVIDIA rejected the **generation** request even though the lightweight BYOK connection test may have succeeded. Try a different allowlisted NVIDIA model or a smaller page selection; inspect server-side provider status, never reveal secrets.
- `stage=byok`: verify BYOK cookie binding, expiry and supported model.
- `code=request_failed`: unexpected server failure. Review CITEM server logs near the request for the sanitized `stage3_processing_failure` stage marker; use HTTP status/stage/code to locate the failing subsystem, not to infer an exact exception.
- `code=non_json_response`: the server or gateway returned a non-JSON error; inspect deployment/network logs.

The generic UI message alone cannot prove which failure occurred. Use the **Network** tab's POST `/api/projects/[id]/ai/processing` status and JSON body to identify the specific issue, and share only `status`, `code`, `stage` (never keys/cookies/PDF private content). This fix is limited to error classification and visibility. Live NVIDIA smoke is still required to establish production correctness.

## Phase 2 source-stage HTTP 500 triage

An error such as `HTTP 500 · stage=source · code=request_failed` means source context preparation failed before the usage quota and NVIDIA request stages. It does **not** demonstrate a bad NVIDIA key or model. That broad stage formerly covered several operations.

The API now returns a fixed `sourceStep` value only for source-stage errors:

| sourceStep | Operation |
|---|---|
| `read_source` | Fetch owned source metadata |
| `read_asset` | Fetch the owned PDF asset metadata |
| `read_annotation` | Fetch the selected text annotation |
| `pdf_download` | Download original PDF from project Storage |
| `pdf_extract` | Load PDF.js and extract selected PDF text |
| `span_build` | Chunk extracted text for citation grounding |

A PDF.js import failure is reported as `HTTP 503 · stage=source · sourceStep=pdf_extract · code=pdf_runtime_unavailable`, rather than an unclassified 500. The API and UI never include stack traces, raw backend errors, PDF text, access tokens or credentials. The user should share only HTTP status, stage, sourceStep and code.

For a quick distinction before deploying this change, choose an existing text annotation as the Copilot context and retry `Analyse context`. Annotation context avoids the PDF binary download and text extraction, although it still needs source and asset metadata. This diagnostic should not be treated as a substitute for the current-head browser test.

## Fix for `pdf_runtime_unavailable` on deployed server (Phase 2)

A live `HTTP 503 · stage=source · sourceStep=pdf_extract · code=pdf_runtime_unavailable` indicates that server-side PDF.js could **not import** before reading the PDF. The NVIDIA connection and model are not implicated by this failure.

This fix explicitly depends on the exact `@napi-rs/canvas@0.1.80` version already used transitively by `pdfjs-dist@5.4.296`. PDF.js 5's Node legacy runtime imports canvas for DOMMatrix and other globals; merely using `getTextContent` can still require it. `next.config.ts` now marks both PDF.js and canvas as server externals and explicitly traces PDF.js assets plus Linux native canvas binaries for the nested Stage 3 API route. Browser PDF UI code is unchanged.

The Stage 3 AI core CI runs `node scripts/assert-stage3-pdf-runtime.mjs` after a production build. It checks a real Node import/text-extraction of a synthetic PDF **and** asserts that the Next.js route's `.nft.json` file trace contains the PDF.js package, native canvas package and Linux native binary. This prevents a dev-only import test from concealing missing production files.

After merging, **redeploy the server's latest `main`** and retry the same PDF. No SQL change or new NVIDIA key is needed. A passing build/trace probe is not itself a live Vercel or Oracle execution test; the user's production attempt remains the last acceptance gate. If the deployed runtime still fails, inspect `@napi-rs/canvas` native binary loading/platform compatibility and the full server-side exception in protected logs (never reveal credentials or source text).

## Phase 2 language and task-following repair

Source Reader's Copilot now supports `Response language: Auto (question) / Türkçe / English`. Auto detects Turkish from the **latest analyst question only**, not from untrusted source text or previous assistant replies. Explicit Turkish or English overrides that heuristic, including for the shortcut buttons.

The trusted Stage 3 system policy requires `summary`, `evidence[].statement`, `unansweredQuestions` and `warnings` in the selected language; `evidence[].quote` and `source_token` **must remain exactly as in the original PDF** for quote verification. The latest analyst question is placed above the untrusted SOURCE_DATA block, so a question such as “bu sayfanın Türkçe özetini yaz” is not drowned out by a long English document. Source attribution remains source-reported, never promoted to an established claim.

If Turkish is required and the generated natural-language explanation is unmistakably English, the server makes **at most one repair attempt**. If the model still ignores the request, the result includes an explicit warning; it does not silently translate source quotes or fabricate any evidence. Previous turns remain bounded, untrusted reference data.

Regression tests cover the two Turkish questions reported by the user, manual language selection, English preference, exact English quotes in Turkish analytical prose and an English-to-Turkish retry. No schema migration or additional credential is necessary. Live NVIDIA confirmation is still required after deployment.

## Phase 2: resilient grounded NVIDIA replies (malformed_output)

An authenticated analyst reproduced `HTTP 422 · stage=nvidia · code=malformed_output` after asking in Turkish how the selected APT28 report described the attack chain over pages 1–5. A valid Turkish analysis had previously returned, but some unsupported evidence suggestions were discarded.

- The Stage 3 prompt now explicitly permits **describing the source-reported attack sequence** while still forbidding invented/unreported steps and unverified attribution.
- Ask responses request **up to 4 short verbatim quotations** (15–200 characters each), avoiding excessive JSON and unsupported long quotes. This is a target, not an authoritative evidence allowance.
- If NVIDIA returns valid JSON with harmless format deviations (missing optional warning arrays, extra unsupported properties, model-invented page fields), the server **whitelists** only schema fields and runs normal quote-token grounding against the original selected PDF. Invalid evidence entries are discarded; invented page or source identifiers are NEVER honored.
- If JSON parsing fails, Stage 3 requests one **compact repair** rather than echoing up to 18,000 chars of malformed assistant text back into the context. At most two NVIDIA generation attempts are made.
- If the first attempt has already produced one or more **verified citations**, but the second reply is malformed, the API may return only those verified citations with **no model summary** and an explicit warning. It never turns an unverified answer into a verified one.
- NVIDIA `finish_reason=length` is reported as `nvidia_output_exhausted` even if partial text was returned; this distinguishes provider output truncation from malformed JSON.
- If both attempts are non-JSON/unverifiable, the API retains the existing safe `malformed_output` failure. The UI recommends selecting 1–2 pages and narrowing the question.

Unit tests cover the reported Turkish attack-chain question, overlong/invalid JSON, invented page numbers, fake quotes, missing arrays, a repair succeeding on attempt two, safe fallback to verified evidence, and repeated unrecoverable output. The live model and attached private PDF are not accessible in CI; production acceptance still requires replaying the question on the deployed build.

No additional SQL migration is required.

## Phase 2 UI refinement — focused chat (design-only PR)

The Source Reader Copilot keeps the same read-only server request, quote verification, BYOK lifecycle, page/annotation scopes, bounded follow-up context, error diagnostics, and analyst-only decisions. This pass **does not** add Phase 3 features or SQL migrations.

- Desktop floating size increases from **440×620** to **660×780** (clamped inside the actual viewport), with a wider **620px** docked layout. Mobile remains full-screen. Saved window geometry uses `citem:stage3-ai-window:v2` so users are not stuck with the older narrow session layout; only geometry is stored.
- CİTEM's canonical theme variables from `src/app/globals.css` are used throughout: `--surface`, `--surface-panel`, `--surface-raised`, `--surface-input`, `--foreground`, `--muted`, `--amber-soft`, `--amber-strong`, `--line`, and `--line-neutral`. The UI avoids introducing a competing color palette.
- The NVIDIA connection indicator is integrated into the compact header, with BYOK controls available from a single button.
- Source context shows a compact title/page line and an explicit **Change context** expander. All three existing context modes and 1–10 page limit remain available. Entire-document and Investigation-wide contexts are still disabled.
- The transcript takes the flexible majority of the panel; source-grounded answer text is larger and clearer. The exact quotations are retained behind expandable **Source excerpts** sections that expose the same PDF page-jump controls. Warnings remain visible.
- A larger composer stays pinned below the independently scrolling chat. Enter-to-send, Shift+Enter newline, Ask/Analyse/Explain, cancellation, diagnostic error text, and language selector all remain functional. The data-transfer and nonpersistent-history notice remains visible.

Accessibility: the context button has `aria-expanded` and `aria-controls`; source evidence uses native `details/summary`. Tests cover collapsed-by-default context and sources, expansion and citation jumps, theme tokens, and unchanged API send contracts.

**Review requested:** PR is intentionally left open/unmerged. Verify appearance on desktop/mobile before merging. The CSS design has not been visually verified in a live user browser.

## NVIDIA model picker convenience

The existing BYOK connection panel now renders an explicit model **select** for NVIDIA NIM instead of a browser-dependent datalist. `nvidia/nemotron-3-super-120b-a12b` appears as **Nemotron 3 Super 120B · Recommended** and is automatically selected whenever NVIDIA NIM is chosen (including the Stage 3 Copilot's default NVIDIA provider). The selected option's full allowlisted model ID is still sent unchanged to the existing `/api/ai/byok/connect` endpoint; no new credential storage, API routes or SQL. Other BYOK providers retain their manual model ID text input. Tests cover no-typing connection, alternate NVIDIA selection and switching providers.

## Default document scope — entire PDF

On opening the Source Reader's Copilot, **Entire PDF** is the default context. A request sends `context: { "kind": "document" }`, **not** a client-supplied page list, range, copied text or signed PDF URL. The owned server reads the original PDF from project Storage and extracts every page in order, attributing source spans to their actual PDF page numbers. All selected pages are processed as source data before NVIDIA generation; none are silently discarded.

The analyst may open **Change context** and select **Entire PDF**, **Current page**, **Selected pages** (1–10 consecutive pages), or **Current annotation** (when a text annotation exists). Existing page citations, BYOK, chat follow-up isolation and intelligence-domain safety remain unchanged.

**Explicit resource limits:** Whole-PDF processing can consume more provider context and quota. PDF.js rejects files with more than **200 pages** or more than **45,000 extracted characters**, returning the safe `pdf_document_too_large` error (HTTP 413) rather than making a partial “entire document” claim. The existing server input-size limit also applies to the final model-facing context. Scanned pages without extractable text cannot be OCR'd by this workflow and cause a clear error. In those cases the analyst can choose a page or bounded page range. This phase does **not** implement retrieval/index-based summarization of very large documents; that remains separate work.

Automated coverage: strict whole-document request schema, every page of a 12-page PDF extracted (beyond old 10-page selection limit), cited page provenance, long-document rejection without silent truncation, and UI default+analyst selection overrides. No new SQL migration.
