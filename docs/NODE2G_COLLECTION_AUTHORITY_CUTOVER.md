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

A real pause is refused if any of the five CİTEM connections has a `RUNNING` collection. After the status changes it checks for `RUNNING` collections again, so a scheduler claim racing the initial check cannot silently pass the authority handoff.

Pre-cutover source status is also preserved as rollback state. `ENABLED` and `PAUSED` are admitted. `ARCHIVED` fails closed because cutover must not silently restore an archived source. A source that is already `PAUSED` before cutover remains `PAUSED`; it is not treated as an error and rollback must not enable it.

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
2. verifies every pre-cutover status is `ENABLED` or `PAUSED`;
3. verifies zero `RUNNING` legacy collection runs;
4. captures status/cursor/version/schedule/last-run metadata;
5. computes SHA-256 for every cursor;
6. counts preserved run history per source;
7. writes a mode-0600 local snapshot under `/tmp`;
8. prints only safe summary metadata and cursor hashes.

No status is changed.

## Pause

Only after Node PR #9 CI, all five live parity gates, live Node restart/isolation gate and security audit are accepted:

```bash
node --env-file=.env.local \
  scripts/node2g-collection-authority-cutover.mjs \
  --pause \
  --snapshot=/tmp/citem-node2g-pre-cutover.json
```

The tool first repeats the active-run gate and writes the pre-cutover snapshot. It then calls the existing trusted `set_technical_source_status` RPC only for connections that are currently `ENABLED`:

```text
ENABLED -> PAUSED
PAUSED  -> PAUSED (no write)
```

Immediately after pausing it repeats the active-run query. If any scheduler claim raced the first check, cutover fails closed with the CİTEM sources left paused rather than declaring dual authority safe.

After the change it re-reads all connections and verifies:

- all five statuses are `PAUSED`;
- zero `RUNNING` collection remains;
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

Rollback is manual and source-specific. First disable and drain the corresponding Node source. Only after that explicit operator action may CİTEM be restored to its pre-cutover state.

The tool requires a hard acknowledgement so rollback cannot become an automatic failback path:

```bash
NODE2G_ROLLBACK_CONFIRMED=true \
node --env-file=.env.local \
  scripts/node2g-collection-authority-cutover.mjs \
  --rollback \
  --snapshot=/tmp/citem-node2g-pre-cutover.json \
  --source=MALWAREBAZAAR
```

Before restoring the CİTEM source the tool requires:

- the current CİTEM status is still `PAUSED`;
- the current cursor hash still matches the preserved pre-cutover cursor hash;
- the preserved pre-cutover status is admitted.

Rollback restores the exact pre-cutover authority status:

```text
pre-cutover ENABLED -> rollback restores ENABLED
pre-cutover PAUSED  -> rollback keeps PAUSED
```

Therefore a source that was already paused before collection-authority cutover is never accidentally enabled by an all-source rollback.

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