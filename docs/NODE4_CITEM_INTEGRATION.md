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
