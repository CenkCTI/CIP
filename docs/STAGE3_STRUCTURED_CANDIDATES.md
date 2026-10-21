# Phase 3 — Structured Processing Suggestions (PR #72, draft)

This builds on Phase 1's source provenance gateway and Phase 2's AI chat reader. It is **not** an autonomous CTI analyst.

## Analyst workflow

1. In Source Reader select **Entire PDF**, **Current page**, **Selected pages** or **Current annotation**.
2. Use **Extract candidates** in the NVIDIA NIM Copilot toolbar.
3. CİTEM reads only the authenticated, owned ORIGINAL PDF or selected annotation and asks NVIDIA for structured suggestions. Every candidate is checked against original server-side source spans with page/annotation provenance.
4. Candidate cards show kind, derivation (`EXTRACTED`, `NORMALIZED` or `MAPPED`), caveats, verified original-language source quotations and `NOT SAVED` state. Exact/project-scoped existing-record comparisons are informational, **never automatic merge**.
5. **Dismiss** removes a suggestion from this ephemeral review session. **Review in Process** navigates to the supporting page and, where an existing text annotation contains the verified quote, opens the regular Process / Extract dialog prefilled for analyst review. Source Claim prefills include the reported stance, type, and `AI_SUGGESTED` origin; other supported destinations use their existing forms.
6. If there is no matching text annotation, the UI instructs the analyst to annotate the cited passage first. This intentionally avoids creating a source annotation implicitly. A candidate alone is never sufficient provenance for a structured database record.
7. Only the analyst clicking the existing **Create** or **Link** in the normal process form can write an intelligence-domain record. The AI route never imports those server actions and never writes indicators, actors, campaigns, malware, source claims, or timelines.

## Contracts and safety

- Candidate kinds: `SOURCE_CLAIM`, `INDICATOR`, `TIMELINE`, `MALWARE`, `CVE`, `MITRE`, `THREAT_ACTOR`, `CAMPAIGN`, `ATTRIBUTION_CLAIM`, `UNANSWERED_QUESTION`.
- Every candidate requires 1–3 verifiable exact source quotes and token aliases. No quote or invalid token means candidate rejection. Client never receives a signing key, raw PDF binary or signed storage URL from this AI API.
- Attribution requires a source assertion; mention-only reports cannot become attribution candidates. CVE, explicitly extracted ATT&CK IDs, named identities and IOC candidates must match their own original source quotations.
- Timeline normalized dates are allowed only when literally supported in the cited excerpt; vague seasons remain an unnormalized source time expression.
- No model confidence or implied information-credibility scoring. Stage 4 reliability, independent attribution judgement and campaign reconstruction remain outside this workflow.
- Matching uses allowlisted fields and `project_id` filters; no investigation DB dump is added to the NVIDIA prompt. Matches are advisory; duplicate decisions remain with the analyst.
- Stage 3 long-PDF usage quota is upgraded by migration `202610210063_stage3_long_pdf_usage_quota.sql`: 30 requests / 1,200,000 input characters per rolling 60-minute window, enforced server-side only for `stage3_processing`, with independent application configuration and unchanged authentication, project ownership, safe secrets and per-request input caps. Other AI workflows keep the original 10 / 200,000 quota; provider BYOK quotas still apply. An unapplied migration is diagnosed as `quota_unavailable` (503) rather than misreported as `rate_limited` (429).

## Work remaining before Phase 3 merge

- Full CI and authenticated browser E2E of source annotation prefill, safe document navigation, controlled Create/Link, and negative mismatched-annotation cases. Unit tests alone cannot prove the live PostgreSQL no-write-before-confirmation gate.
- Entire PDF fallback: client orchestrates *all* known pages as bounded, verified 8-page segments when the single-document context exceeds its limit, or upfront for over 200 pages. Splits ranges on input overflow, NVIDIA output exhaustion, or invalid structured JSON (8→4→2→1 pages). A single-page model failure pauses with an explicit error and never increments progress. Other provider errors and quota limit pauses preserve completed segments and their citations. Explicit Continue button. Each batch produces separately cited results (not a falsely synthesized document-wide conclusion). Underlying PDF file limit 50 MB remains; scanned-image-only PDFs require OCR. Quota is charged per model request and long PDFs may require resuming later.
- Form review hardening: Timeline AI candidates now prefill event title, editable description and source-supported date/precision; vague source dates require analyst interpretation. Source Claim link origin defaults to AI_SUGGESTED. Annotation quote matching normalizes whitespace correctly.
- Live NVIDIA/Nemotron response acceptance on a real APT28 PDF: candidate quality, exact quote matching, extraction JSON compliance, duplicate review and user-facing feedback.
- Lexical-overlap Source Claim warnings, case-insensitive literal name lookup and exact actor alias lookups are implemented. No semantic auto-merge; alias case folding requires a future canonical-alias index.
- Longer documents still need Phase 4 chunk orchestration and review queue.

**Do not merge PR #72 until the acceptance gates pass.**


## Verified-analysis completion gate (21 October 2026)

A live 34-page CSRB Storm-0558 test exposed that a batch could be counted as processed even when NVIDIA returned no verified summary, no source excerpts, or an obviously English response despite explicit Turkish selection. The new server-side gate applies **only to Analyse**, not Ask (which can legitimately have no evidence) or Extract (which can legitimately have no candidates). Each Analyse completion requires a non-empty narrative summary, at least one server-verified source excerpt, zero rejected evidence items and no unvalidated fallback warnings. Explicit Turkish requests also reject unambiguously English narrative responses after the model repair attempt. If validation fails, return a typed 422; the client bisects 8→4→2→1 pages and never counts invalid batches. A single-page failure stays paused for analyst inspection; quota, auth and network failures do not auto-retry. A verified quote still does NOT independently prove every factual clause in a model-generated summary, and this stage does not make credibility, actor attribution or report-wide conclusions. Live BYOK verification is required; CI uses controlled responses.


## Nonblocking incomplete page review — 21 October 2026

The CSRB 34-page run could previously stop at 2/34 when a subsequent page failed the strict source-evidence gate. The document orchestrator now **continues after an irreducible single-page failure** (validity, original-language mismatch, output exhaustion or dense input), adds that page + its fixed diagnostic code to a visible `Needs analyst review` backlog, and does **not count it as analysed**. It keeps source-cited results from other pages and finishes with `Review needed`, not `Complete`, if any gaps remain. `Retry flagged pages` explicitly retries **only unresolved single pages**. Non-recoverable failures (quota, expired credentials, provider/network outage) still **pause** without skipping any work. All progress is ephemeral within the mounted Copilot component; navigating or reloading loses it. Each attempt consumes the project's CİTEM quota and may incur NVIDIA usage. CI covers a 34-page document with a failed third page, later targeted recovery, and preservation of quota pauses. This is a UI workflow improvement, **not** automatic determination that front matter is unimportant, and does not grant AI database-write rights.
