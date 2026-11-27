# Annotation Information Credibility

CİTEM keeps four analyst judgments independent. Source reliability (A–F) describes a source. Annotation credibility (1–6) describes information in one saved passage. Assertion credibility (1–6) describes a specific source position on a canonical Source Claim. Analytical confidence describes an analyst's conclusion. Grades never transfer between these records or aggregate into a score.

| Grade | Meaning | Annotation review |
| --- | --- | --- |
| 1 | Confirmed by independent reporting | Disabled in this preview |
| 2 | Probably true | Available |
| 3 | Possibly true | Available |
| 4 | Doubtful | Available |
| 5 | Improbable | Available |
| 6 | Cannot be judged | Available |

Not evaluated means an assessable passage has no review. An unavailable query is displayed separately. An old grade remains visible with a re-evaluation warning after the passage or provenance changes.

## Recording and revising a review

Save a highlight or underline as usual, then expand its annotation card in Source Reader. Select a grade and write a rationale of 10–4,000 characters. REGION annotations need selected information or an analyst comment identifying the observation. An uninterrupted highlight spanning several pages uses one annotation ID and one review stream. Fragment geometry, PDF bytes, highlight colors and extraction links continue to use the existing workflow.

In Fusion Inventory, open the same annotation and choose **Evidence & provenance**. The shared editor loads the same current review and paginated history. Saving a revision refreshes the review and the surrounding view. A linked annotation on another record is shown as provenance context with a link to the original passage.

## Persistence, provenance and security

Migration 085 follows the existing CİTEM chain through 083 and reserves 084 for Stage 4.2. The current and Fusion read models use security-invoker views. The table enables owner-scoped SELECT under RLS. The owner-only RPC checks the authenticated reviewer, resolves source and asset IDs from the canonical annotation, serializes review writes, checks expected current revision and passage fingerprint, and stores immutable revisions. Identical requests replay safely. Reusing a request ID with different inputs and editing a superseded revision produce a conflict.

The SHA-256 provenance token includes selected text, observation comment, annotation kind, saved locations and fragment content, asset identity/hash/state/derivation, and relevant source identity and publication metadata. Ordinary view actions, collection links and analyst notes on the **source** leave the token unchanged. An archived source or unavailable asset makes a previous assessment stale. History stores the fingerprint and IDs without copying the passage, geometry, document, private URLs or Storage credentials. Annotation deletion removes the active row from both surfaces while preserving review history. Successful project deletion cascades its reviews. The pre-existing Fusion activity audit can block direct deletion of projects with audited children and warrants separate maintenance.

Private GET responses paginate history by 20 revisions. The POST requires JSON, validates origin, limits input bytes, and returns bounded errors. Source Reader and Fusion batch compact current reads and load history only in an opened inspector. A missing migration leaves both existing surfaces usable with an explicit unavailable state.

## Grade 1

The API, schema and database reject grade 1. Stage 4.1 M1C establishes independence between two compatible assertions about one canonical proposition. A future passage-level review must demonstrate that different-source corroboration in the same Investigation is current, independently observed, and covers the entire evaluated proposition or an explicit scope. It must also detect later invalidation. Existing assertion-grade and lineage rules continue to apply to assertions.
