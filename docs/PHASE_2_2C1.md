# Phase 2.2C.1 — ThreatFox Community API IOC Connector

## Contract and security
CİTEM sends only `POST https://threatfox-api.abuse.ch/api/v1/` with `Auth-Key`, using read-only `types` for connection testing and `{ "query": "get_iocs", "days": 1 }` for synchronization. Lookback is an integer from 1–7 days. No endpoint, request method, header, proxy, redirect, or query is browser-configurable.

Persistent credentials reside only as AES-256-GCM ciphertext, 12-byte random IV, and authentication tag in `ioc_provider_credentials`. `IOC_CREDENTIAL_ENCRYPTION_KEY` must be a stable server-only base64 encoding of exactly 32 bytes (`openssl rand -base64 32`). AAD binds owner, connection, provider `THREATFOX`, and key version. Rotation tests before atomic replacement; disconnect deletes encrypted material, disables scheduling, and preserves runs, candidates, provenance, and acceptance history.

## Mapping and synchronization
The exact allowlist maps `domain` to DOMAIN, `ip:port` to IPV4/IPV6 with a separate port, and `url` to URL. Unsupported types and malformed records are skipped, never guessed. Malware sample hashes are not extracted. Provider confidence remains an external assertion and never determines CİTEM status, attribution, or blocking. Ingestion creates candidates, provenance, runs, and an informational watermark only—never Indicators, Evidence, Sources, Malware, relationships, or graph edges.

ThreatFox synchronization re-reads the complete configured window. Canonical candidate and deterministic provider-source fingerprints provide idempotence; the informational cursor never filters the window. The default schedule is 60 minutes and the allowed ThreatFox interval is 30–1440 minutes. Requests have a 15-second timeout, 8 MiB body limit, 1,000-item limit, redirects disabled, no in-run retry, and controlled errors. Operators must review current abuse.ch/ThreatFox fair-use and commercial terms before deployment.

## Deployment and tests
1. Confirm migrations 001–027 are unchanged and apply migration 028.
2. Run `NOTIFY pgrst, 'reload schema';`.
3. Configure `IOC_CREDENTIAL_ENCRYPTION_KEY=<base64-encoded-32-byte-key>` server-side and redeploy.
4. Run `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, and `scripts/test-phase2-2c1-migration.sh` against PostgreSQL 16.
5. Normal CI uses mocked responses. Optional live checks require `THREATFOX_LIVE_TEST=true` and an operator-supplied credential; never print the key, body, headers, or complete IOC values.

## Live acceptance checklist
1. Confirm PR #27 is merged.
2. Confirm `IOC_TEST_PROVIDER_ENABLED` is false or removed.
3. Apply migration 028.
4. Run `NOTIFY pgrst, 'reload schema';`.
5. Configure a stable server-only `IOC_CREDENTIAL_ENCRYPTION_KEY`.
6. Redeploy Preview.
7. Open `/osint?view=iocs`.
8. Confirm ThreatFox shows Not connected.
9. Open Connect ThreatFox.
10. Enter a real ThreatFox Auth-Key.
11. Select lookback 1 day.
12. Keep scheduler disabled initially.
13. Run Test and connect.
14. Confirm the key is no longer displayed.
15. Confirm the connection shows Credential configured.
16. Run Sync now.
17. Confirm one exact MANUAL run succeeds.
18. Confirm real ThreatFox candidates appear.
19. Confirm candidates display defanged.
20. Confirm ThreatFox provenance is visible.
21. Confirm provider confidence is shown as provider confidence.
22. Confirm no Indicator was created automatically.
23. Run Sync now again after the cooldown.
24. Confirm canonical candidates are not duplicated.
25. Confirm observation counts increase.
26. Mark one candidate REVIEWED.
27. Dismiss another candidate.
28. Sync again.
29. Confirm analyst triage remains unchanged.
30. Accept one IP candidate into an owned Investigation.
31. Confirm an UNVERIFIED IP Indicator is created or reused.
32. Confirm one IMPORT observation exists.
33. Repeat the same acceptance.
34. Confirm no second acceptance or observation is created.
35. Confirm no Evidence, Source or Graph edge was created.
36. Enable scheduled synchronization with a 60-minute interval.
37. Invoke the existing CRON-protected scheduler.
38. Confirm one SCHEDULED ThreatFox run succeeds.
39. Confirm second-user isolation.
40. Rotate the ThreatFox Auth-Key.
41. Confirm the new credential is tested before replacement.
42. Disconnect the credential.
43. Confirm scheduling is disabled.
44. Confirm previous candidates and provenance remain.
45. Confirm manual sync fails closed after disconnect.
46. Inspect logs and confirm no Auth-Key or raw body is present.
47. Review current ThreatFox fair-use/commercial terms before Production.
48. Repeat essential checks in Production only after Preview acceptance.

## Exclusions
No submission, search, bulk download, scraping, MalwareBazaar, automatic analytical record, blocking, export, URLhaus, OTX, VirusTotal, Talos, STIX, TAXII, or MISP integration is included. A later explicitly scoped provider phase may add another fixed adapter.

## Superseded by Phase 2.2C.2
Phase 2.2C.1's informational v1 cursor and intentional full-window remapping apply only to that historical delivery. Phase 2.2C.2 manual **Sync now** accepts safe v1 input, upgrades it in memory, persists strict provider-bound v2 after successful completion, and filters already-seen records before normalization. Automatic scheduling and automatic Inbox refresh are deferred. See [PHASE_2_2C2.md](PHASE_2_2C2.md).

## Phase 2.2C.3 follow-on
AlienVault OTX subscribed-Pulse support is implemented as manual incremental ingestion with bounded Pulse provenance; see [PHASE_2_2C3.md](PHASE_2_2C3.md). No automatic OTX scheduler is enabled.
