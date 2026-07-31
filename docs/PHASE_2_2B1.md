# Phase 2.2B.1 — Secure JSON Feed support

Phase 2.2B.1 adds JSON Feed 1.1 and exact-version-1 compatibility to the existing RSS/Atom ingestion architecture. The project owner authoritatively confirmed Phase 2.2B live acceptance before this work began and PR #25 was merged.

## Architecture and security

Migration 026 adds `JSON_FEED` to `research_feed_type`; migrations 001–025 are immutable. The shared detector selects the protected XML path or strict `JSON.parse` path. JSON must be an object with an exact supported `version`, bounded non-empty `title`, and `items` array. Depth is limited to 40, traversed nodes to 100,000, items to 500, categories to 50, and authors inspected to 20. Generic JSON, STIX-shaped JSON, unknown versions, dangerous keys, HTML responses, JSONP, and media/body mismatches are rejected with safe errors.

Accepted media types are `application/feed+json`, `application/json`, `application/rss+xml`, `application/atom+xml`, `application/xml`, `text/xml`, and controlled `text/plain`. DNS pinning, public-address validation after redirects, downgrade prevention, timeouts, compression and 5 MiB compressed/decompressed limits, header isolation, fixed User-Agent, exact leases, owner binding, and scheduler authentication remain shared and unchanged.

## Normalization and exclusions

`id`, `title`, `url` (then `external_url`), `summary`, `content_text` (then sanitized `content_html`), publication/modification dates, tags, language (then feed language), and first bounded author (then legacy author) map into the canonical research-item model. HTML becomes plain text and is never rendered or persisted as executable markup. Existing owner-scoped URL/content fingerprints provide cross-format deduplication and retain all provenance observations.

`next_url`, hubs, icons, images, attachments, audio/video, and extensions are ignored. No pagination, downloads, crawling, generic APIs, STIX, TAXII, MISP, IOC/entity extraction, or automatic Evidence, analytical Source, Graph, Indicator, or Threat Actor creation is included.

## Deployment and automated validation

Apply migrations through 026, run `NOTIFY pgrst, 'reload schema';`, and redeploy. Run `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `git diff --check`, and the Phase 2.2A, 2.2B, and 2.2B.1 migration harnesses. Migration harnesses require PostgreSQL 16 or later.

## Live acceptance checklist

1. Confirm PR #25 is merged.
2. Apply migration 026 to Preview/live Supabase.
3. Confirm migrations 023–025 were already applied.
4. Run `NOTIFY pgrst, 'reload schema';`.
5. Redeploy Preview; open `/osint`; confirm RSS and Atom sources still load.
6. Open Settings and confirm “Add RSS, Atom or JSON Feed”.
7. Add `https://www.jsonfeed.org/feed.json`, enabled with automatic scheduling at 15 minutes.
8. Before using Fetch now, confirm a SCHEDULED, SUCCEEDED run, JSON Feed detected type, HEALTHY health, and normalized items.
9. Confirm `content_html` is plain text and neither raw HTML nor raw JSON appears.
10. Open an original link; exercise read/unread, save/unsave, and dismiss/restore.
11. Link to an owned Investigation; confirm Linked OSINT, no Evidence, analytical Source, or Graph relationship; unlink and confirm the global item remains.
12. Use Fetch now and confirm MANUAL; where validators permit, confirm a later NOT_MODIFIED run.
13. With a controlled RSS/JSON duplicate, confirm one canonical item and multiple-source provenance.
14. Confirm generic and malformed JSON fail safely and persist no partial item.
15. Verify second-user denial for sources, items, triage, and links.
16. Confirm URL query values, bodies, raw JSON, resolved IPs, headers, secrets, and stack traces do not appear in UI or logs.

Preview deployment, schema reload, public-feed scheduling, and multi-user checks remain deployment acceptance work and must not be inferred from local tests.
