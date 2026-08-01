# Phase 2.2C.3 — AlienVault OTX Connector

CİTEM reads only the authenticated user's **subscribed Pulses** from the fixed `GET https://otx.alienvault.com/api/v1/pulses/subscribed` endpoint. `X-OTX-API-KEY` credentials are encrypted server-side with the existing AES-256-GCM system and never returned after configuration.

## Manual workflow and safety

Connect OTX, select a bounded 30/90/180/365-day bootstrap window, test the credential with a one-Pulse read, then use **Sync now**. Longer windows increase historical coverage but may include obsolete or noisy community indicators and increase false-positive risk. Scheduling, polling, Realtime, browser OTX access, automatic Indicator/Evidence/entity creation, attribution, blocking, and response are excluded.

The cursor is `{schema_version:1, provider:"ALIENVAULT_OTX", last_modified:<canonical UTC>, pulse_ids_at_boundary:<sorted unique 24-hex IDs>}`. Bootstrap requests only the selected window. Incremental reads use a one-minute overlap and locally exclude older/seen boundary Pulses. Modified known Pulses are eligible. The cursor advances only with exact-lease trusted completion; failures preserve it. An unchanged run is `NOT_MODIFIED`.

## Bounds and mappings

Runs accept at most five 50-Pulse pages (250 Pulses), 1,000 indicators, 8 MiB per page, and 16 MiB total, with a 15-second timeout and redirects disabled. Pagination is reconstructed against the fixed HTTPS origin and path; hostile hosts, schemes, parameters, repeats, or loops fail closed.

Supported OTX types are IPv4, IPv6, CIDR, domain, hostname, URL, FileHash-MD5, FileHash-SHA1, FileHash-SHA256, and CVE. Email, URI, FilePath, Mutex, PEHASH, IMPHASH, SSL certificate fingerprints, YARA, inactive, unknown, and invalid records are skipped with bounded classifications. Confidence is always null.

Each source retains bounded Pulse name/description, author, TLP, dates, references, tags, adversary, countries, industries, malware families, ATT&CK IDs, and indicator identity. Fingerprints include Pulse and indicator identity, so one canonical IOC appearing in two Pulses produces one candidate and two provenance sources. Content remains external community intelligence requiring analyst validation and explicit Investigation acceptance.

## Deployment and live acceptance

Set `IOC_CREDENTIAL_ENCRYPTION_KEY` server-side, apply migration 029 only with operator authorization, run `NOTIFY pgrst, 'reload schema';`, redeploy, then follow the operator checklist in the phase request: connect through the UI, verify the key disappears, run two manual syncs, inspect Pulse cards and distinct provenance, preserve triage through a modified Pulse, test idempotent acceptance, rotate, disconnect, verify history survives, confirm second-user isolation, and inspect logs for secrets or raw batches. Live checks require `OTX_LIVE_TEST=true`, an operator-supplied API key, and live-project authorization; they are not part of CI.
