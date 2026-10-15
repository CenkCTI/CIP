# Stage 3 — Evidence / Source Claim

## Purpose

Not every analytically useful source passage is naturally a Timeline Event, IOC, Malware record, CVE, ATT&CK Technique, Campaign identity, Threat Actor identity, or Attribution Claim.

**Evidence / Source Claim** captures the remaining proposition-level intelligence without forcing it into the wrong CTI object.

A Source Claim answers:

> What proposition does this source passage communicate?

It does **not** answer:

- Is the proposition true?
- Is the source reliable?
- How credible is the information?
- Does CITEM agree with it?
- Which hypothesis does it support?
- How much confidence should an analyst assign?

Those are later analytical operations.

## Core distinction

The model separates the proposition from each source's position toward it:

```text
Source Annotation A ── ASSERTS ──┐
Source Annotation B ── ASSERTS ──┼── Source Claim
Source Annotation C ── DENIES  ──┘
```

The canonical Source Claim may be:

> APT28 uses compromised routers as operational infrastructure.

Different sources can independently assert, deny, qualify, or ambiguously discuss that same proposition.

Counting source positions is descriptive only. It is not a corroboration score because source independence, reliability, access, and information credibility are evaluated later.

## Source Claim

`source_claims` contains only the canonical proposition and a lightweight classification:

- `GENERAL`
- `BEHAVIOR`
- `TARGETING`
- `CAPABILITY`
- `RELATIONSHIP`
- `INTENT_OBJECTIVE`
- `IMPACT`
- `TECHNICAL_CONTEXT`

The classification is for navigation/filtering, not epistemic scoring.

Claims deliberately have no reliability, credibility, confidence, truth, or assessment fields.

## Source position / assertion

`source_claim_assertions` links an exact Source Annotation to one Source Claim.

Each relation records:

- `ASSERTS`
- `DENIES`
- `QUALIFIES`
- `UNCLEAR`

It also records:

- optional `source_qualifier`, preserving wording such as *likely*, *possibly*, *we assess*, or *according to third-party reporting*;
- `mapping_origin`, distinguishing source-explicit wording from analyst/reference/AI-assisted normalization;
- whether the relation was `CREATED` with the claim or `LINKED` to an existing canonical claim.

The stance describes the **source's position**, never CITEM agreement.

## Why this is not the generic processing ledger

Timeline already has typed annotation provenance, and Source Claims need richer proposition-specific semantics than a generic output pointer can express.

Source Claims therefore use dedicated tables and RPCs rather than adding a `SOURCE_CLAIM` column to `source_annotation_outputs`.

This prevents the generic Stage 3 ledger from becoming a universal Observation database and keeps claim-specific concepts—stance and source qualifier—typed.

## Analyst workflow

From a Source Annotation:

```text
Process / Extract
  → Evidence / Source Claim
      → Link existing Source Claim
      or
      → Create new Source Claim
```

Creating a claim requires an atomic proposition. A single annotation may produce multiple Source Claims.

Linking an existing claim is always explicit. CITEM does not semantically auto-merge propositions.

### Create

The analyst records:

- canonical proposition;
- claim kind;
- source stance;
- source qualifier, if present;
- mapping origin.

The database creates the Source Claim and its first source-position link atomically.

### Link existing

The analyst selects an existing canonical proposition and explicitly records the current source's stance/qualifier.

If the same annotation is already linked to that claim, the typed link is updated rather than duplicated.

### Unlink

Removing one source-position link preserves the claim while any other source positions remain.

If the final source-position link is removed, the now-unsupported Source Claim is deleted automatically. A Source Claim is therefore not allowed to silently survive without source support through the normal workflow.

## Mapping origin

Default claim normalization is `ANALYST_MAPPED`, because an analyst commonly rewrites natural-language reporting into a concise canonical proposition.

Use `SOURCE_EXPLICIT` only when the proposition is retained essentially as the source explicitly states it.

`AI_SUGGESTED` remains an analyst-accepted mapping origin. It never means autonomous persistence or autonomous analytical judgement.

## Dedicated workspace

`/projects/[id]/source-claims` provides a review directory showing:

- canonical proposition;
- claim kind;
- number of source positions;
- stance counts.

`/projects/[id]/source-claims/[claimId]` shows the full provenance view:

- canonical proposition;
- ASSERTS / DENIES / QUALIFIES / UNCLEAR positions;
- exact source quote;
- source qualifier;
- mapping origin;
- source/publisher/page;
- original asset filename and SHA-256;
- deep link to the exact Source Annotation.

The analyst can correct the canonical proposition, claim kind, stance, source qualifier, and mapping origin without altering the underlying source quote.

## Database trust boundary

Migration `202610150060_stage3_source_claims.sql` creates trusted RPCs for claim/assertion lifecycle operations.

Mutation RPCs are `SECURITY DEFINER` but:

- revoke public execution;
- grant execution only to `authenticated`;
- use a fixed `search_path`;
- require `auth.uid()`;
- explicitly call `project_is_owned`;
- verify annotations/claims belong to the same Investigation.

Direct authenticated insertion into Source Claim tables is not granted. This prevents clients from bypassing the provenance-first creation path.

## Stage boundary

This capability belongs to Stage 3 because it structures what a source says.

Stage 4 can later evaluate source reliability and information credibility against each source position.

Stage 6 can later assign Source Claims an analytical role such as supporting or contradicting a hypothesis. That later **evidence role** is intentionally absent from Stage 3.
