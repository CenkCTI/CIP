# Phase 2.3F-C — Source Semantics & Observation Taxonomy

## Purpose

Phase 2.3F-C gives Technical Signal observations deterministic epistemic meaning before Phase 2.3F-D introduces baselines and anomaly detection.

The phase answers:

- what kind of source produced a record;
- whether the record is observed, reported, published, scored, enriched, or unknown;
- what technical phenomenon the record represents;
- what the source explicitly does not represent;
- the source authority, collection-mode, coverage, and freshness character.

Core guardrail: **reporting volume is not attack volume**.

## Raw truth vs derived semantics

`technical_signal_observations` remains append-only source truth.

Migration 048 adds `technical_observation_semantics` as an append-only, versioned, owner-scoped derived projection. Raw observations are not rewritten to change their meaning.

Semantic engine version: `2.3F-C-v1`.

## Foundational mappings

| Source | Source class | Basis | Semantic kind |
| --- | --- | --- | --- |
| CISA KEV | `EXPLOITED_VULNERABILITY_CATALOG` | `PUBLISHED` | `KNOWN_EXPLOITED_VULNERABILITY` |
| NVD | `VULNERABILITY_DATABASE` | `PUBLISHED` | `VULNERABILITY_RECORD` |
| FIRST EPSS | `EXPLOIT_PROBABILITY` | `SCORED` | `EXPLOIT_PROBABILITY_SCORE` |
| ThreatFox | `IOC_SHARING` | `REPORTED` | `IOC_REPORT` |
| MalwareBazaar | `MALWARE_SAMPLE_REPOSITORY` | `PUBLISHED` | `MALWARE_SAMPLE_RECORD` |

Unknown historical sources remain explicitly `UNKNOWN` rather than receiving invented certainty.

## Source character

Source metadata additionally exposes categorical authority, semantic collection mode, freshness semantics, `represents`, and `doesNotRepresent` descriptions. No numeric trust score is introduced.

Important examples:

- EPSS is a probability estimate and is not observed exploitation, severity, or organizational risk.
- ThreatFox provides shared/reported IOC intelligence and is not exhaustive global attack telemetry.
- MalwareBazaar records malware-sample repository metadata and does not imply execution, infection, or attack count.
- CISA KEV is an authoritative known-exploited vulnerability catalog and is not an exhaustive exploit-event counter.
- NVD records vulnerability publication/modification context and does not establish exploitation.

## Recording path

The server-side source registry attaches deterministic semantics to adapter output. The trusted signal client uses `record_technical_signal_with_semantics`, introduced by migration 048.

The wrapper validates semantics against the source-system mapping, calls the existing `record_technical_signal` function, and writes the semantic projection in the same database transaction. A mismatch fails the transaction rather than committing an observation with contradictory semantics.

Legacy callers that omit semantic fields are conservatively classified server-side from `sourceSystem`; unknown systems receive `UNKNOWN` semantics.

## Historical backfill

Migration 048 backfills existing Technical Signal observations deterministically from their persisted `source_system` values. The backfill is conflict-safe through `(owner_id, observation_id, semantics_version)` uniqueness.

No AI, natural-language inference, or arbitrary trust judgement is used.

## UI

`/techint/sources/semantics` provides a bounded source-semantics diagnostic surface showing source class, authority, basis, semantic kind, collection mode, freshness semantics, and the `Represents` / `Does not represent` boundary.

This is not the final Global View.

## Security

- `technical_observation_semantics` uses owner-scoped RLS.
- authenticated users can read only their own projection;
- authenticated direct writes are denied;
- semantic recording is service-role only;
- the projection is append-only;
- provider credentials, collector capabilities, and secrets are never stored in semantic state.

## Validation

Automated validation includes:

- TypeScript tests for the five foundational source mappings and unknown fallback;
- PostgreSQL migration harness for historical backfill, trusted recording, mismatch rollback, append-only behavior, ACLs, and cross-owner isolation;
- all existing lint, typecheck, Vitest, build, and migration harnesses.

## Preview acceptance

Do not rerun migrations 041–047.

After CI is green and the operator authorizes Preview/test changes:

1. apply migration 048 once;
2. reload PostgREST schema cache if necessary;
3. verify existing observations have semantic projection rows;
4. verify FIRST EPSS is `EXPLOIT_PROBABILITY / SCORED / EXPLOIT_PROBABILITY_SCORE`;
5. verify ThreatFox is represented as reported IOC sharing rather than measured attack telemetry;
6. verify MalwareBazaar is represented as published malware-sample repository metadata;
7. run one bounded real collection and verify new observations receive semantics;
8. confirm collection/history behavior remains healthy.

Manual acceptance should be performed one step at a time.

## Out of scope

Phase 2.3F-C does not add baselines, MAD/median logic, anomaly scoring, Global Technical Activity state, situation detectors, convergence/divergence, new source packs, geography, map UI, final Global View, AI analysis, profile relevance, or business-risk scoring.

Phase 2.3F-D begins only after migration 048 and Preview semantic acceptance are complete.
