# NODE-2G Collection-Authority Cutover — CİTEM Side

This runbook controls the final handoff of public/global TechINT collection authority from the five frozen legacy CİTEM collectors to BAYKUSH Intelligence Node.

Sources:

- `CISA_KEV`
- `NVD_CVE`
- `FIRST_EPSS`
- `THREATFOX`
- `MALWAREBAZAAR`

## Safety model

The tool is fail-closed. Its default mode is read-only `dry-run`.

It never:

- deletes Technical Signal history;
- resets a source cursor;
- archives a source connection;
- deletes a source connection;
- migrates provider credentials to Node;
- exports investigations, notes, evidence, attribution, products or analyst judgement;
- enables automatic dual-authority failback.

A real pause is refused if any of the five CİTEM connections has a `RUNNING` collection.

## Environment

Use the server-side Supabase environment already used for trusted collection tooling:

```text
NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

If the Supabase project contains admitted source connections for more than one owner, also set:

```text
CITEM_OWNER_ID=<owner uuid>
```

The service-role key and raw cursor JSON must never be committed to Git.

## Dry-run

```bash
node --env-file=.env.local scripts/node2g-collection-authority-cutover.mjs --dry-run
```

The dry-run:

1. resolves exactly one owner and all five source connections;
2. verifies zero `RUNNING` legacy collection runs;
3. captures status/cursor/version/schedule/last-run metadata;
4. computes SHA-256 for every cursor;
5. counts preserved run history per source;
6. writes a mode-0600 local snapshot under `/tmp`;
7. prints only safe summary metadata and cursor hashes.

No status is changed.

## Pause

Only after Node PR #9 CI, all five live parity gates, live Node restart/isolation gate and security audit are accepted:

```bash
node --env-file=.env.local \
  scripts/node2g-collection-authority-cutover.mjs \
  --pause \
  --snapshot=/tmp/citem-node2g-pre-cutover.json
```

The tool first repeats the active-run gate and writes the pre-cutover snapshot. It then calls the existing trusted `set_technical_source_status` RPC for every source and requires:

```text
ENABLED -> PAUSED
```

After the change it re-reads all connections and verifies:

- all five statuses are `PAUSED`;
- every cursor SHA-256 is unchanged;
- every legacy run-history count is unchanged.

If any preservation check fails, cutover is not accepted.

## Authority declaration

After CİTEM pause verification, Node must still show all five production sources healthy with zero failed normalization and the Node final invariant audit accepted.

Only then may the operator record:

```text
COLLECTION AUTHORITY: BAYKUSH INTELLIGENCE NODE
```

CİTEM Node API consumption remains NODE-4. No temporary dual-authority collection is created merely to keep legacy CİTEM source freshness.

## Rollback

Rollback is manual and source-specific. First disable and drain the corresponding Node source. Only after that explicit operator action may CİTEM be resumed.

The tool requires a hard acknowledgement so rollback cannot become an automatic failback path:

```bash
NODE2G_ROLLBACK_CONFIRMED=true \
node --env-file=.env.local \
  scripts/node2g-collection-authority-cutover.mjs \
  --rollback \
  --snapshot=/tmp/citem-node2g-pre-cutover.json \
  --source=MALWAREBAZAAR
```

Before enabling the CİTEM source the tool requires the current cursor hash to still match the preserved pre-cutover cursor hash.

To rollback all five sources, omit `--source` only after Node authority has been disabled/drained for all five.

## Evidence retained

Repository documentation may record:

- cutover timestamp;
- source key;
- connection ID;
- pre/post status;
- cursor version;
- cursor SHA-256;
- run-history count;
- Node final-audit result.

Do not commit:

- raw cursor JSON;
- service-role key;
- provider credentials;
- private workspace records.
