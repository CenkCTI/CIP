# Phase 2.2C.2 — Manual Incremental IOC Synchronization

## Behavior
Phase 2.2C.2 makes the explicit **Sync now** action incremental. ThreatFox still performs exactly one server-side `get_iocs` request for the configured 1–7 day window, bounded at 1,000 provider records. A bootstrap has no cursor and maps the complete bounded window. On later manual runs, provider IDs at or below the cursor are classified as already seen before normalization and are not sent to PostgreSQL again. Consequently, repeatedly checking an identical provider window does not create observations, replay skip markers, increase source observation counts, or alter analyst triage.

A newly published ID greater than the cursor remains eligible even when its `first_seen` timestamp is older than the timestamp watermark. Known mapping anomalies in an incremental delta produce bounded skip markers and do not break the provider run. A non-empty bootstrap where every eligible record fails known mapping validation still fails with `THREATFOX_MAPPING_FAILED` and preserves the previous cursor.

With no eligible records, the adapter returns `NOT_MODIFIED`, `items: []`, the complete provider received/already-seen counts, and zero eligible, mapped, and mapping-skipped counts. Manual messages distinguish the first synchronization from an identical repeat, for example:

- `Provider synchronized; 417 new observations processed; 183 provider records skipped safely.`
- `Provider checked; no new observations were available; 600 provider records were already seen.`

## Cursor contract
The opaque, bounded JSON cursor is `{"schema_version":2,"provider":"THREATFOX","max_id":"<decimal string>","max_first_seen":"<ISO timestamp or null>"}`. Decimal IDs contain at most 40 digits and are compared with `BigInt`; they are never converted through an unsafe `Number` or serialized as `BigInt`. Strict safe v1 cursors are upgraded in memory and v2 is persisted by the next successful exact-lease completion. Malformed, oversized, wrong-provider, unsupported, negative, fractional, exponent, whitespace, and unsafe numeric cursors fail closed without exposing cursor contents.

The high-water mark includes the greatest valid provider identity observed in the full bounded response, including safely classified malformed records. Only the existing trusted PostgreSQL completion may persist it after adapter-result validation and exact live-lease validation. Credential, cursor, transport, mapping, contract, stale-lease, and completion failures preserve the prior cursor.

## Deployment and Inbox behavior
Automatic provider scheduling and automatic IOC Inbox refresh are deferred. This phase adds no Vercel cron, GitHub Actions scheduler, change-token endpoint, browser poller, background request, or automatic `router.refresh()`. The Inbox remains server rendered and updates after **Sync now**, normal action revalidation, or an explicit browser refresh.

The existing protected scheduler infrastructure inherited from earlier phases remains available but is not invoked or configured by Phase 2.2C.2. The provider-independent cursor and delta contract is intentionally reusable by a future optional operator-controlled scheduler. A future self-hosted deployment may enable scheduled synchronization; the current deployment does not claim automatic or continuous refresh.

## Security, limits, and exclusions
No migration is required, and migrations 001–028 remain unchanged. Auth-Keys remain encrypted and server-only. The browser never requests ThreatFox. Candidates remain `NEW` until explicit triage or acceptance. This phase adds no streaming worker, per-IOC request/transaction, automatic Indicator, verification, blocking, or response action. URLhaus, AlienVault OTX, VirusTotal, MISP, TAXII, and STIX remain future work.

## Manual acceptance checklist
With explicit operator credentials: connect ThreatFox with a one-day lookback; run one bootstrap; record received/mapped/skipped counts; run **Sync now** again after the five-minute cooldown; verify an identical window is `NOT_MODIFIED`; verify prior candidates, skip markers, observation counts, and REVIEWED/DISMISSED states are unchanged; then verify a genuine higher ID appears after a later manual check and remains `NEW`. Confirm cursor advancement only after successful completion, safe logs, owner isolation, and no background browser or deployment requests. Do not execute this checklist without operator authorization.
