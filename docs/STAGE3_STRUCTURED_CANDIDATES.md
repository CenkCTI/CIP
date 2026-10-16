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
- No new SQL migration. BYOK quota, origin validation and server-only credential protections are unchanged.

## Work remaining before Phase 3 merge

- Full CI and browser E2E of source annotation prefill, safe document navigation, controlled Create/Link, and negative mismatched-annotation cases.
- Live NVIDIA/Nemotron response acceptance on a real APT28 PDF: candidate quality, exact quote matching, extraction JSON compliance, duplicate review and user-facing feedback.
- Improve semantic similarity suggestions for Source Claim (no automatic semantic merge), actor aliases and case-normalized exact name matching.
- Longer documents still need Phase 4 chunk orchestration and review queue.

**Do not merge PR #72 until the acceptance gates pass.**
