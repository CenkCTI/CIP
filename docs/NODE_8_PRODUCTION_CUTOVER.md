# NODE-8 production cutover

## Contract and status

CİTEM is a read-only, server-side consumer of canonical BAYKUSH Intelligence Node truth. This change prepares the consumer and evidence tooling for BAYKUSH NODE-8J (`c2f2739ccdd91a89b4fdd8156519368897f493bc`, draft Node PR #49); it does not deploy either system and does not claim production acceptance.

**Current real production cutover status: `MANUAL_PENDING`. CİTEM CI green != Node production accepted.** Final acceptance occurs only after evidence from the real Oracle Node and CİTEM is consumed by `NODE8_PRODUCTION_ACCEPTANCE_V1`.

## Production configuration

Set these only in the CİTEM server runtime:

```dotenv
BAYKUSH_NODE_BASE_URL=https://<production-node-host>
BAYKUSH_NODE_API_TOKEN=<server-side-secret>
BAYKUSH_NODE_TIMEOUT_MS=9000
```

Production rejects non-HTTPS URLs, loopback/localhost hosts, missing values, invalid protocols, and timeout values outside 1000–30000 ms. The URL is provider-neutral; Oracle-specific hostnames are intentionally not hardcoded. Never create a `NEXT_PUBLIC_*` variant or pass the token through React props. The client adds it only to the server-side `Authorization` header.

The normal credential needs exactly `techint:read` for `/v1/techint/*` and `sources:read` for `/v1/sources*`. It must not have `ops:read`; operations credentials remain separate. CİTEM uses only bounded GET endpoints and cannot mutate raw records, canonical records, provenance, checkpoints, routing truth, or measurements.

## Deployment and rollback

1. Deploy the accepted, digest-pinned Node release and verify its HTTPS endpoint independently.
2. Provision a dedicated CİTEM credential with only `techint:read` and `sources:read`.
3. Configure the three server environment values above and deploy the exact CİTEM commit.
4. Confirm the browser bundle sentinel scan and run real cutover acceptance.
5. Provide the resulting evidence to the NODE-8J operator; do not mark acceptance from CI alone.

Rollback by restoring the previous CİTEM server configuration/deployment. Keep legacy collection paused: Node unavailability must remain visible rather than silently changing authority or producing zero data.

## Degraded semantics

Independent Node reads use bounded partial results. A failed surface is explicitly `DEGRADED`, `UNKNOWN`, or `UNAVAILABLE`; successful sibling reads remain usable. Unknown is not zero, no coverage is not no activity, reporting volume is not attack volume, BGP UPDATE is not an incident/attack/outage/hijack, geography is not attacker origin, Node health is not threat level, and Node failure is not successful collection. Previously rendered data must not be labeled as a current successful query after a failure.

## Acceptance evidence

CI contract check (synthetic only):

```bash
npm run node8:citem-cutover
```

It emits `CITEM_NODE8_CUTOVER_CONTRACT_V1`, labeled `SYNTHETIC`, `CONTRACT_ONLY`, and `NOT_PRODUCTION_ACCEPTANCE`. It cannot emit the real schema.

On the future cutover host, store the token in a mode `0600` file and run:

```bash
CITEM_NODE8_CUTOVER_CONFIRM=YES \
BAYKUSH_NODE_BASE_URL=https://<production-node-host> \
BAYKUSH_NODE_API_TOKEN_FILE=/secure/path/citem-node-token \
BAYKUSH_NODE_TIMEOUT_MS=9000 \
BAYKUSH_NODE_RELEASE_DIGEST='ghcr.io/cenkcti/baykush-intel-node@sha256:<64-hex-digest>' \
npm run node8:citem-cutover -- --real > CITEM_NODE8_CUTOVER_EVIDENCE.json
```

Real mode requires explicit confirmation, non-local HTTPS, a credential file, bounded timeout, and an exact supplied digest. It prints no token. It validates real source/catalog reads, safe invalid-token 401, normal-credential 403 on the ops-only health endpoint, server-only handling, explicit degradation, and the GET-only mutation boundary. A genuine zero-length valid Node dataset remains a successful read but is distinct from request failure.

The real output schema is `CITEM_NODE8_CUTOVER_EVIDENCE_V1` and records timestamp, CİTEM SHA, Node digest, credential-free origin, eight required booleans, and final result.

For a production build made with a known fake server sentinel:

```bash
BAYKUSH_NODE_API_TOKEN='<known-fake-sentinel-at-least-32-bytes>' npm run build
CITEM_NODE8_SECRET_SENTINEL='<same-known-fake-sentinel-at-least-32-bytes>' npm run node8:client-secret-scan
```

The scan is deliberately limited to `.next/static`, the browser-served artifact tree; server artifacts are not false-positive failures.
