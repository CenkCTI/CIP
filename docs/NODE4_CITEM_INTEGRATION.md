# NODE-4 — CİTEM Integration Boundary

CİTEM consumes BAYKUSH Intelligence Node as a server-side read client. Node remains the authority for public/global technical collection and measurement truth.

Rules:

- no Node database credential in CİTEM;
- no Node client credential in browser bundles;
- no automatic reactivation of the five legacy CİTEM collectors;
- no mirroring Node measurement truth back into a second CİTEM global-measurement database;
- private investigations, notes, evidence, attribution and products remain CİTEM-owned;
- `null`/unavailable measurement buckets are rendered as gaps, never coerced to zero;
- measurement semantics come from Node `represents` / `doesNotRepresent` metadata;
- Global View must work without the legacy deterministic anomaly engine.

The initial Global View supports 24H, 7D and 30D ranges and separates Vulnerability & Exploitation from Malware & IOC reporting.

This branch adds the transport-independent range/measurement contracts and a coverage-aware series component. The production server-side transport must be wired only after the Node authenticated API boundary is available.
# Implemented NODE-4 boundary

`/techint/global` is server-rendered from the authenticated Node v1 API and supports `24h`, `7d`, and `30d`. It does not query Node PostgreSQL, owner-scope global truth, or feed Node measurements through the legacy anomaly engine. Partial failures keep successful panels visible; a Node outage leaves private CİTEM features operational and never triggers legacy collection.

The central legacy authority guard defaults to `NODE_AUTHORITY` for all five cut-over sources. Only deliberate `MANUAL_ROLLBACK` configuration permits legacy execution, consistent with the NODE-2G source-specific rollback runbook.

The Node token is imported only by `server-only` modules, runtime responses are Zod validated, GET retries are bounded to one retry for network/502/503/504 failures, and production base URLs require HTTPS.
