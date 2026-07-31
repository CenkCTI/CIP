# Phase 2.2C — IOC Connector Foundation and IOC Inbox

## Purpose and trust boundary
Phase 2.2C introduces a provider-independent path from a server-owned adapter to an owner-local **candidate**, provenance observations, analyst triage, and explicit acceptance. A candidate is an untrusted external assertion; it is not an Indicator, CVE, Evidence, Source, relationship, or CİTEM analytical judgement. No real CTI provider is integrated in this phase.

## Common model
Migration `202607310027_phase2_2c_ioc_connector_foundation.sql` adds `CIDR` to `indicator_type` in its own committed transaction, then creates candidate/status/run enums and the owner-scoped connection, exact run, cursor, candidate, source, and acceptance tables. Candidate identity is `(owner, candidate type, normalized value, normalized port)`; providers never merge owners. Deterministic source fingerprints update bounded observation rows rather than accumulating duplicates. Metadata is object-only and limited to 32 KiB; completion is limited to 1,000 items and 10 MiB.

Connections contain no endpoints or credentials. Provider keys resolve only through the hard-coded adapter registry. Exact claims bind owner, connection, run, provider, cursor identity, token hash, and expiry. Only a successful exact completion advances the opaque bounded cursor. Failure releases only its exact lease. Trusted claim/completion/failure RPCs are service-role-only; RLS gives authenticated analysts owner-scoped reads, while narrow RPCs perform triage and acceptance.

## Normalization and display
The shared `src/lib/ioc-connectors` contract normalizes IPv4, IPv6, ports, IPv4/IPv6 CIDR network addresses, IDNA domains/hostnames, HTTP(S) URLs, exact MD5/SHA1/SHA256 values, and CVEs without DNS, HTTP, WHOIS, sockets, or reputation checks. Inbox network values are defanged and never active links. Provider reference URLs are separate provenance fields. The Inbox supports bounded filtering and deterministic keyset ordering by last observation and ID; raw metadata is excluded from list results.

## Triage and acceptance
`NEW → REVIEWED`, `NEW/REVIEWED → DISMISSED`, and `DISMISSED → NEW` are explicit actions. Re-ingestion never resets analyst state. Acceptance selects an owned Investigation and atomically records immutable promotion history. IPv4/IPv6 map to IP, CIDR to CIDR, domain/hostname to DOMAIN, URL to URL, and hashes to HASH. Indicators stay `UNVERIFIED`; their observation origin is `IMPORT`, and port/algorithm/provider context remains provenance. CVE acceptance requires analyst-confirmed severity and uses the existing CVE entity—not an Indicator. No Graph edge or other analytical relationship is created.

## Synthetic provider and scheduler
`TEST_SYNTHETIC` / **Deterministic Test IOC Provider** is local, fixed, credential-free, and performs no network requests. It is registered only with `IOC_TEST_PROVIDER_ENABLED=true`; Preview must disable the gate after acceptance. Its UI states: **TEST / SYNTHETIC** and “This result is local and deterministic. It is not live intelligence.” Existing `CRON_SECRET` remains the only scheduler boundary; IOC concurrency/batch controls remain bounded independently, and future adapter execution plugs into this model without a second inbox.

## Deployment and tests
1. Apply migration 027 after migrations 001–026.
2. Run `NOTIFY pgrst, 'reload schema';`.
3. Deploy the application; optionally gate the synthetic adapter in Preview only.
4. Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and `scripts/test-phase2-2c-migration.sh` on PostgreSQL 16+.

## Live acceptance checklist
1. Confirm PR #26 is merged.
2. Apply migration 027.
3. Run `NOTIFY pgrst, 'reload schema';`.
4. Enable in Preview only: `IOC_TEST_PROVIDER_ENABLED=true`.
5. Redeploy Preview.
6. Open `/osint`.
7. Confirm Intelligence Feed still works.
8. Open IOC Inbox.
9. Confirm the synthetic provider is labelled TEST / SYNTHETIC.
10. Run manual synthetic sync.
11. Confirm MANUAL/TEST ingestion run succeeds.
12. Confirm candidates appear for all supported types.
13. Confirm values display defanged.
14. Confirm the same candidate is not duplicated after a second run.
15. Confirm provenance count increases.
16. Confirm multiple source observations remain visible.
17. Mark one candidate REVIEWED.
18. Dismiss another candidate.
19. Run sync again.
20. Confirm analyst states are preserved.
21. Restore the dismissed candidate.
22. Select an IPv4 candidate.
23. Accept it into an owned Investigation.
24. Confirm an UNVERIFIED IP Indicator is created or reused.
25. Confirm an IMPORT observation exists.
26. Confirm provider and candidate provenance is visible.
27. Confirm no Graph relationship was created.
28. Confirm no Evidence was created.
29. Confirm no analytical Source was created.
30. Accept a hash candidate.
31. Confirm hash algorithm provenance is preserved.
32. Accept a CIDR candidate.
33. Confirm CIDR Indicator support.
34. Accept a CVE candidate and provide required analyst fields.
35. Confirm a CVE is created or reused.
36. Confirm the CVE was not converted to an Indicator.
37. Confirm second-user denial.
38. Disable the environment gate.
39. Confirm the synthetic provider disappears after redeployment.
40. Confirm no synthetic records are mistaken for live intelligence.

## Limitations and exclusions
There is no ThreatFox, URLhaus, OTX, VirusTotal, Talos, generic JSON API, credential, OAuth, STIX, TAXII, MISP, extraction, AI, watchlist, alert, notification, blocking, export, or automatic entity/relationship support. Future explicit ThreatFox/URLhaus/OTX phases must add adapters to this registry and common Inbox, plus a separate secure credential design where required.
