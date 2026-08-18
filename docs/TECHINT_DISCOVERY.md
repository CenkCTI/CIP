# CİTEM TechINT Discovery

## Purpose

The Discovery workbench consumes deterministic NODE-7 findings from BAYKUSH Intelligence Node. CİTEM does not recalculate source overlap, upstream-origin convergence, novelty, composition change, geography or routing context.

## Surfaces

- `/techint/global` contains a compact, separately-failing discovery summary.
- `/techint/discovery` contains convergence, effective new entities, positive composition expansion, explainable top movers and country-level geography distribution.
- `/techint/discovery/entity/{type}/{key}` drills into exact-canonical related records, bounded lineage, explicit geography and, for IP subjects, bounded RIPE routing context.

## Failure isolation

The following Node requests remain independent:

1. source/core measurement state;
2. Internet Infrastructure routing measurement/status state;
3. discovery/convergence state;
4. geography state;
5. entity lineage/context state.

A NODE-7 error must not hide the existing Vulnerability & Exploitation, Malware & IOC or Internet Infrastructure lanes.

## Semantic guardrails

CİTEM presentation preserves the producer contract:

- correlation is not causation;
- source-system overlap is not the same as multiple upstream origins;
- `DATE` precision is not hour-level concurrency;
- source-effective first seen is separate from Node discovery time;
- historical acquisition is not current novelty;
- positive composition expansion is not risk/severity;
- absent current reporting is not removal;
- observed infrastructure location is not attacker origin;
- reported target and reported activity are distinct geography classes;
- current geolocation is not historical geolocation;
- ASN context is not physical location;
- BGP announcement is not attack;
- BGP withdrawal is not an outage verdict;
- no routing hijack inference is made.

## Security

All calls use the existing `server-only` BAYKUSH Node client. Browser code receives only validated Node response data. Node bearer credentials and optional geography-provider credentials never leave the server boundary.

## Caching

Discovery and convergence use short revalidation windows; geography uses a longer revalidation window because it is persisted current-snapshot enrichment. Cache freshness never changes the semantic timestamp carried by Node assertions.
