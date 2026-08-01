# Phase 2.2C.3 — AlienVault OTX Connector

CİTEM reads only the authenticated user's **subscribed Pulses** from the fixed `GET https://otx.alienvault.com/api/v1/pulses/subscribed` endpoint. `X-OTX-API-KEY` credentials are encrypted server-side with the existing AES-256-GCM system and never returned after configuration.

## Manual workflow and safety

Connect OTX, select a bounded 1/3/7/14/30/90/180/365-day bootstrap window (7 days by default), test the credential with a one-Pulse read, then use **Sync now**. Longer windows increase historical coverage but may contain more stale or noisy community indicators and may exceed the safe per-run ingestion limit. Scheduling, polling, Realtime, browser OTX access, automatic Indicator/Evidence/entity creation, attribution, blocking, and response are excluded.

The version-2 cursor separates the committed Pulse watermark from an optional bounded continuation snapshot. Version-1 cursors remain readable and upgrade only through successful trusted completion. Bootstrap requests only the selected window. Incremental reads use a one-minute overlap and locally exclude older/seen boundary Pulses. Modified known Pulses are eligible. Cursor state advances only with exact-lease trusted completion; failures preserve it. An unchanged completed snapshot is `NOT_MODIFIED`.

## Bounds and mappings

Fetches accept at most five 50-Pulse pages (250 Pulses), 8 MiB per page, and 16 MiB total, with a 15-second timeout and redirects disabled. Each trusted completion persists at most 1,000 provider outcomes. Pagination is reconstructed against the fixed HTTPS origin and path; hostile hosts, schemes, parameters, repeats, or loops fail closed.

Supported OTX types are IPv4, IPv6, CIDR, domain, hostname, URL, FileHash-MD5, FileHash-SHA1, FileHash-SHA256, and CVE. Email, URI, FilePath, Mutex, PEHASH, IMPHASH, SSL certificate fingerprints, YARA, inactive, unknown, and invalid records are skipped with bounded classifications. Confidence is always null.

Each source retains bounded Pulse name/description, author, TLP, dates, references, tags, adversary, countries, industries, malware families, ATT&CK IDs, and indicator identity. Fingerprints include Pulse and indicator identity, so one canonical IOC appearing in two Pulses produces one candidate and two provenance sources. Content remains external community intelligence requiring analyst validation and explicit Investigation acceptance.

## Deployment and live acceptance

Set `IOC_CREDENTIAL_ENCRYPTION_KEY` server-side, apply migration 029 only with operator authorization, run `NOTIFY pgrst, 'reload schema';`, redeploy, then follow the operator checklist in the phase request: connect through the UI, verify the key disappears, run two manual syncs, inspect Pulse cards and distinct provenance, preserve triage through a modified Pulse, test idempotent acceptance, rotate, disconnect, verify history survives, confirm second-user isolation, and inspect logs for secrets or raw batches. Live checks require `OTX_LIVE_TEST=true`, an operator-supplied API key, and live-project authorization; they are not part of CI.

## Bootstrap-window recovery

New OTX connections default to a **7-day** bootstrap window. Supported manual bootstrap windows are **1, 3, 7, 14, 30, 90, 180, and 365 days**. Shorter windows are recommended because longer community-intelligence windows may contain more stale or noisy indicators and can exceed the unchanged safe per-run limits of 250 Pulses or 1,000 indicators.

The connector never silently truncates an oversized response. `OTX_PULSE_LIMIT` remains fatal, while an aggregate indicator count above 1,000 is drained through explicit resumable batches. Fatal failures preserve the previous cursor and persist no partial candidates or sources. After a successful bootstrap, the manual incremental cursor processes only eligible new or modified Pulses. Automatic synchronization remains excluded.

### Live recovery checklist

1. Apply migration 030.
2. Run `NOTIFY pgrst, 'reload schema';`.
3. Redeploy Preview.
4. Open OTX settings.
5. Change bootstrap look-back from 30 days to 7 days.
6. Run **Sync now**.
7. If successful, inspect Pulse context and candidate counts.
8. Run **Sync now** again after the manual cooldown.
9. Confirm unchanged data becomes `NOT_MODIFIED`.
10. If 7 days still exceeds the indicator limit, retry with 3 days and record the controlled limit classification.

## Resumable manual OTX snapshots

Even a one-day subscribed-Pulse window, or one large Pulse, can contain more than 1,000 indicators. The 1,000-record bound is therefore a **per-batch trusted persistence limit**, not a fatal aggregate fetch limit. The hard fetch limits remain 250 Pulses, five pages, 8 MiB per page, and 16 MiB total.

The first manual batch fixes a bounded logical snapshot with `window_start` and server-time `window_end`. Pulses are ordered by canonical modified time and Pulse ID; indicator outcomes are ordered by a SHA-256 item key derived from stable provider identity. Unsupported, inactive, and invalid records consume deterministic skip positions. A version-2 cursor stores only the committed Pulse watermark plus non-sensitive continuation hashes and counts—never raw IOC values, descriptions, credentials, or provider bodies. Existing version-1 cursors upgrade in memory and persist version 2 only through successful exact-lease completion.

When a batch has deferred outcomes, CİTEM completes and persists at most 1,000 outcomes atomically and displays **Continue import**. Continuation is always analyst-triggered: there is no polling, timer, background loop, scheduler, or browser OTX request. Continuations reuse the fixed snapshot window and bypass only the fresh-check cooldown; the database lease still rejects concurrent submissions. A failed completion preserves the prior continuation so retry selects the same deterministic batch. After the final batch clears continuation, the next unchanged manual check returns `NOT_MODIFIED`.

### Resumable live acceptance checklist

1. Keep the existing failed one-day run for audit history.
2. Redeploy the repaired Preview.
3. Select one-day look-back.
4. Run **Sync now**.
5. Confirm the first batch succeeds instead of `OTX_INDICATOR_LIMIT`.
6. Confirm no more than 1,000 outcomes are persisted.
7. Confirm **Continue import** appears.
8. Continue until the snapshot finishes.
9. Confirm candidate/source totals rise batch by batch without duplicates.
10. Confirm Pulse context remains available.
11. Confirm analyst triage remains unchanged.
12. Run **Sync now** after completion.
13. Confirm `NOT_MODIFIED`.
14. Inspect logs and cursors for secrets or raw IOC values.
