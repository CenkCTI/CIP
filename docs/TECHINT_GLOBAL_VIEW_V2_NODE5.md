# CİTEM TechINT Global View v2 — NODE-5 Integration

## Scope

This slice consumes the expanded BAYKUSH Intelligence Node source inventory and the NODE-5 measurement contracts. It changes only CİTEM's server-side Node queries and Global View presentation. Private CİTEM evidence, investigations and legacy collectors are unchanged.

The upstream dependency is the stacked BAYKUSH Node read-API slice `CenkCTI/BAYKUSH-Intel-Node#26` and its measurement parent `#25`.

## Selected Global View measurements

The v2 dashboard requests the original five measurements plus the six newly admitted NODE-5 measurement contracts:

- CISA KEV additions
- NVD CVE publications
- EPSS retained scored records
- GitHub reviewed advisory publications
- GitHub reviewed advisory updates observed
- CISA ICS advisory publications
- CISA ICS advisory updates observed
- ThreatFox IOC reporting volume
- MalwareBazaar sample reporting
- Feodo C2 records newly observed
- SSLBL certificate listings observed

MITRE ATT&CK, JVN, CERT-EU and Siemens remain visible as source-status/context sources but do not receive chart series because the Node admission layer forbids measurement projection for those sources.

## Bounded request behavior

The Node measurement API deliberately limits a request to at most eight measurement keys. CİTEM does not weaken that control. `getNodeMeasurements()` splits the eleven selected metrics into bounded batches of at most eight keys, validates every Node response with the existing v1 schema, and merges the validated series server-side.

No CİTEM user ID, owner ID or private-project identifier is sent to the global Node endpoints.

## UI behavior

Global View v2 keeps the existing two analytical lanes:

- Vulnerability & Exploitation
- Malware & IOC

The page continues to display Node-provided coverage and semantic boundaries. It adds human-readable labels for the expanded measurement set while preserving the canonical measurement key and the `represents` / `doesNotRepresent` text.

Measurement movement remains factual telemetry. CİTEM does not turn source publication/reporting changes into automated threat, attack, victim, compromise or risk judgements.

## Non-goals

- No legacy collector reactivation.
- No private evidence upload to Node.
- No AI interpretation layer.
- No ANLAK/KARARGÂH integration.
- No merge as part of this draft slice.
