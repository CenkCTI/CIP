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
- Entire PDF fallback: client orchestrates *all* known pages as bounded, verified 8-page segments when the single-document context exceeds its limit, or upfront for over 200 pages. Splits oversized ranges recursively; preserves successfully processed batches on pause or rate limit; explicit Continue button. Each batch produces separately cited results (not a falsely synthesized document-wide conclusion). Underlying PDF file limit 50 MB remains; scanned-image-only PDFs require OCR. Quota is charged per model request and long PDFs may require resuming later.
- Form review hardening: Timeline AI candidates now prefill event title, editable description and source-supported date/precision; vague source dates require analyst interpretation. Source Claim link origin defaults to AI_SUGGESTED. Annotation quote matching normalizes whitespace correctly.
- Live NVIDIA/Nemotron response acceptance on a real APT28 PDF: candidate quality, exact quote matching, extraction JSON compliance, duplicate review and user-facing feedback.
- Lexical-overlap Source Claim warnings, case-insensitive literal name lookup and exact actor alias lookups are implemented. No semantic auto-merge; alias case folding requires a future canonical-alias index.
- Longer documents still need Phase 4 chunk orchestration and review queue.

**Do not merge PR #72 until the acceptance gates pass.**
