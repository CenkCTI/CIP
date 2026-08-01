# Phase 2.2C.2 — Provider-independent incremental IOC synchronization

## Behavior
The protected OSINT scheduler is the primary workflow; it claims only due, enabled, non-archived owner connections and runs the same bounded adapter/orchestrator/completion path as the explicit **Sync now** operational override. The deployment cron checks every 15 minutes, while each connection continues to enforce its visible 30–1,440 minute interval. Existing schedules are not silently enabled.

ThreatFox still performs exactly one server-side `get_iocs` request for the configured 1–7 day window (at most 1,000 records). A bootstrap has no cursor and maps the bounded window. A non-empty bootstrap in which every mapping has a known failure remains `THREATFOX_MAPPING_FAILED`, and its cursor is not advanced. Incremental runs compare validated decimal provider IDs with `BigInt`: IDs greater than `max_id` are eligible even if `first_seen` is older; IDs at or below it are already seen and never reach normalization or PostgreSQL completion. A bounded timestamp fallback is used only for records without a comparable ID.

The opaque, bounded JSON cursor is `{"schema_version":2,"provider":"THREATFOX","max_id":"<decimal string>","max_first_seen":"<ISO timestamp or null>"}`. Decimal IDs are at most 40 digits and are never converted through `Number` or serialized as `BigInt`. Strict safe v1 cursors are upgraded in memory and v2 is persisted by the next successful exact-lease completion. Malformed, oversized, wrong-provider, unsupported, negative, fractional, exponent, whitespace, or unsafe numeric cursors fail closed without exposing their contents.

The next high-water mark includes the greatest valid ID in the full response, including safely classified malformed records. An incremental delta containing only known mapping anomalies succeeds with bounded skip markers and advances after trusted completion. With no eligible records, the adapter returns `NOT_MODIFIED`, no items, full received/already-seen diagnostics, and zero eligible/mapped/skipped values.

## Inbox change detection
While mounted, visible, and online, the Inbox polls an authenticated owner-scoped lightweight completion token about every 45 seconds. It refreshes the current server-rendered route only when the token changes, retaining filters/query parameters, announces only the non-negative increase in NEW observations, backs off after failures, and removes timers/listeners on unmount. It contains no service-role credential and never contacts ThreatFox.

## Atomicity and security
Only the existing trusted PostgreSQL completion can advance the cursor, after strict adapter diagnostics validation and exact live-lease validation. Adapter, credential, transport, mapping, stale-lease, and completion failures preserve the previous cursor. No Auth-Key, cursor body, provider body, raw IOC batch, ciphertext, IV, tag, or SQL details are shown or logged. Candidates remain `NEW` until explicit triage/acceptance.

## Operational limits and exclusions
No schema migration is required. This phase adds no streaming worker, per-IOC request/transaction, automatic Indicator, verification, blocking, or response action. URLhaus, AlienVault OTX, VirusTotal, MISP, TAXII, and STIX remain future work.

## Live acceptance (operator credentials required)
Follow the 17-step checklist in the Phase 2.2C.2 delivery request: connect with one-day lookback and a visible 60-minute schedule, bootstrap, wait until due, verify delta/NOT_MODIFIED behavior and no repeated skips/observations, verify automatic Inbox discovery and preserved NEW/REVIEWED/DISMISSED states, validate atomic cursor movement, safe logs, second-user isolation, and the incremental manual override. Never run this checklist without an operator-provided Auth-Key and project authorization.
