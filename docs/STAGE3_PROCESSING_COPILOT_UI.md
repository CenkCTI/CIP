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
