# Stage 3 Processing Copilot — PR-B (Phase 2)

## Scope

This phase adds a usable floating **AI Processing Copilot** to the CİTEM Source Reader for owned PDF sources. It depends on PR-A's read-only `/api/projects/[id]/ai/processing` endpoint. No intelligence-domain writes or new SQL migrations are introduced.

Open `/projects/[id]/sources/[sourceId]` and choose **AI Copilot**. The panel:

- Is draggable and resizable on desktop (default 440 × 620); minimizable, dockable and dismissible; mobile uses a full-screen sheet.
- Persists **window geometry only** to `sessionStorage["citem:stage3-ai-window:v1"]`.
- Reuses the existing NVIDIA NIM BYOK connection panel, HttpOnly session cookie, and connection status endpoint.
- Offers current **text** annotation, active PDF page, and selected 1–10 consecutive pages. Entire-document and Investigation-wide contexts are intentionally out of scope.
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
