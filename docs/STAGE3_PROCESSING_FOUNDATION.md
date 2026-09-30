# CİTEM Stage 3 — Processing Foundation

## Mission

Stage 3 converts collected source material into comparable, provenance-preserving structured CITEM records. It answers:

- **What exactly does the source say?**
- **How should that source-derived content be structured or normalized?**

It does **not** decide whether the source is reliable, whether the information is true, whether several events form one Campaign, or whether an actor is ultimately responsible.

The operating pipeline is:

```text
Source
  → Annotation
  → Process
  → Create or link existing structured record
  → Preserve raw wording + normalized value + mapping origin
  → Analyst explicitly marks the annotation Processed or Ignored
```

## Processing state

Every Source Annotation has one explicit analyst-owned work state:

- `UNPROCESSED`
- `PROCESSED`
- `IGNORED`

The state is deliberately **not** inferred from output count. One annotation may generate several records, or may be reviewed and require no structured output.

`IGNORED` requires an analyst reason. Reopening clears the processed timestamp/actor and returns the annotation to the queue.

No percent-complete metric is introduced.

## Provenance ledger

`source_annotation_outputs` is a provenance ledger, not an analytical relationship graph.

It records:

- source annotation;
- structured target;
- whether the target was `CREATED` or an existing record was `LINKED`;
- the source wording;
- the normalized/canonical value where applicable;
- mapping origin;
- analyst identity and time.

Supported structured outputs:

- Indicator;
- Malware;
- CVE;
- MITRE Technique;
- Campaign identity;
- Threat Actor identity/profile;
- source Attribution Claim.

Timeline retains its existing typed `timeline_event_source_annotations` provenance table from migration 057.

## Mapping origin

Normalization and mapping decisions retain origin:

- `SOURCE_EXPLICIT` — source explicitly supplied the identity/value;
- `ANALYST_MAPPED` — analyst mapped source wording to a canonical value, such as ATT&CK;
- `REFERENCE_MAPPED` — mapping came from an external/reference taxonomy;
- `AI_SUGGESTED` — analyst accepted an AI suggestion.

`AI_SUGGESTED` never means CITEM autonomously made an analytical judgement.

## Attribution claims

A source saying “APT28 conducted X” is not the same as CITEM concluding that APT28 conducted X.

`source_attribution_claims` therefore stores source-reported actor claims independently of Attribution hypotheses/assessments. A claim may optionally point to a canonical Threat Actor identity while preserving the exact claimed actor text.

## Exact duplicate behavior

Some duplicates are deterministic and safe to resolve during processing:

- Indicator: same type + normalized value;
- CVE: same CVE identifier;
- ATT&CK: same Technique ID.

For those records, a create action links the annotation to the exact existing record instead of creating a duplicate.

Malware, Campaign and Threat Actor names are not automatically semantically merged. Existing records are offered for explicit analyst linking.

## IOC suggestions

`extractIndicatorCandidatesFromText` performs conservative client-side extraction of likely:

- URLs;
- email addresses;
- common hashes;
- IPv4/CIDR values;
- domains, including common `[.]` defanging.

These are **candidates only**. They are not saved until the analyst chooses a candidate and submits it through the processing action.

## Explicit boundary

Stage 3 does not:

- score source reliability or information credibility;
- automatically assign confidence to source claims;
- create Campaign reconstruction memberships;
- create Attribution hypotheses from source claims;
- infer semantic relationships between extracted entities;
- automatically merge non-deterministic identities;
- auto-mark annotations Processed;
- calculate a Stage 3 completion percentage.

Those boundaries preserve the later Source Evaluation, Operational Picture, Hypothesis and Assessment stages.


## Source Reader integration

The annotation sidebar uses one **Process / Extract** surface for structured Stage 3 work. Timeline remains backed by its typed `timeline_event_source_annotations` provenance table; other destinations use the generic, typed-target processing ledger.

The processing drawer exposes:

- Timeline Event;
- Indicator / IOC;
- Malware;
- CVE;
- MITRE ATT&CK;
- source-reported Campaign identity;
- Threat Actor identity/profile;
- source Attribution Claim.

Every non-Timeline destination supports **Link existing** when appropriate. Linking records annotation provenance only. It does not create an entity-to-entity analytical relationship.

Creating or linking output records never auto-closes the annotation. The analyst explicitly chooses **Mark processed**, **Ignore**, or **Reopen**.

## Processing queue visibility

The Source Reader annotation panel shows unprocessed, processed and ignored counts. The Source Library shows the number of unprocessed annotations per Source.

These counts are resumability aids. They are not interpreted as a percentage-complete metric.

## Migration acceptance

`scripts/test-stage3-processing-foundation-migration.sh` applies migrations 053–058 in dependency order and checks:

- default `UNPROCESSED` state;
- processing-state timestamp/analyst consistency;
- typed single-target output enforcement;
- Indicator provenance output;
- source Attribution Claim persistence.

The Stage 2 and PDF migration harnesses explicitly exclude migration 058 from their pre-migration phase so the Stage 3 schema cannot be applied before Source Annotation tables exist.


## Bulk IOC review

When annotation text contains several technical observables, the Source Reader detects conservative IOC candidates and lets the analyst select a subset before pressing **Add selected Indicators**.

The server re-validates every selected candidate. Exact Indicator identity is resolved by `type + normalized_value`; an existing Indicator is linked rather than duplicated. New and existing targets both receive annotation provenance.

Bulk processing remains idempotent at the annotation-target ledger boundary and never marks the annotation processed automatically.

## Record-side provenance

Indicator, Malware, CVE, MITRE, Campaign and Threat Actor detail pages now reconstruct the Stage 3 provenance chain:

```text
Structured record
  → source_annotation_outputs
  → Source Annotation
  → Source
  → Original Source Asset
  → SHA-256
```

The UI shows source title/publisher, page, source wording, CREATED/LINKED action, mapping origin, normalized value when distinct, asset filename/hash and a deep link back to the exact Source Annotation.

This provenance display is intentionally not a Source Evaluation score.

## Source-reported attribution on Actor profiles

When an Attribution Claim is optionally mapped to a canonical Threat Actor, the Actor detail page shows it in a separate **Source-reported attribution** section.

The section explicitly states that these are reporting statements/evidence inputs and are not CITEM attribution conclusions or preferred hypotheses. This keeps Stage 3 source claims distinct from the later competing-hypothesis and assessment workflows.
