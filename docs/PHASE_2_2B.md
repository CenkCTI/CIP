# Phase 2.2B — Global OSINT Intelligence Feed

## Product and trust model
Phase 2.2B moves RSS, Atom, and JSON Feed collection from Investigation scope to the authenticated owner's global OSINT workspace. Existing `project_id` values remain nullable legacy provenance. Migration 025 backfills canonical project ownership, deterministically merges owner-local duplicate fingerprint components (oldest item, stable UUID tie-break), combines observations and preserves fingerprints. Users never share rows: RLS is based on `auth.uid() = owner_id`.

The `/osint` stream mixes canonical items by effective time (`published_at`, otherwise `first_seen_at`) and stable ID, with bounded search, state, provenance and pagination data. Read, saved and dismissed timestamps are independent. Linking is explicit, owner checked and never creates Evidence, Sources, indicators, entities, attribution, or graph edges. Settings is an in-page, focus-managed drawer.

## Scheduler
`GET /api/internal/osint/scheduler` is Node-only and requires `Authorization: Bearer <CRON_SECRET>`. It accepts no IDs, URLs, actors, owners, or query secrets. Migration 025 supplies an atomic bounded due-feed claim using `FOR UPDATE SKIP LOCKED`; ingestion retains Phase 2.2A DNS pinning, redirect/XML/size controls and exact run-bound leases. Runs are `MANUAL` or `SCHEDULED`. Normal intervals are 15, 30, 60, 360, or 1440 minutes; failure retry is deterministic and capped at 24 hours.

Configure server-only `CRON_SECRET`, `OSINT_SCHEDULER_ENABLED`, `OSINT_FETCH_BATCH_SIZE` (1–20), `OSINT_FETCH_CONCURRENCY` (1–3), and `OSINT_SCHEDULER_TIME_BUDGET_MS` (5000–45000). Invoke GET every 15 minutes using Vercel Cron or an approved external scheduler. Do not put the secret in `vercel.json` or a public variable. Production scheduling is **not claimed active** until deployment configuration is confirmed.

## Deployment
Apply `202607310025_phase2_2b_osint_intelligence_feed.sql` after immutable migrations 001–024, reload PostgREST, configure server variables, deploy Preview, and then perform acceptance below. Migration 024 remains covered by `scripts/test-phase2-2a-migration.sh`.

## Live acceptance checklist
1. Apply migration 025 to Preview Supabase.
2. Confirm migrations 023 and 024 were already applied.
3. Reload the PostgREST schema.
4. Configure `CRON_SECRET`.
5. Configure `OSINT_SCHEDULER_ENABLED`.
6. Configure bounded scheduler environment variables.
7. Configure the deployment cron or approved external scheduler.
8. Deploy the Preview environment.
9. Confirm OSINT appears in the top-level sidebar.
10. Confirm Research Feeds is absent from Investigation tabs.
11. Confirm the old Research Feeds URL redirects to `/osint`.
12. Open OSINT Settings.
13. Confirm Settings opens above the current page.
14. Confirm Settings does not navigate to another route.
15. Add GitHub Atom, SANS ISC, and Cisco Talos (or another public security RSS source).
16. Do not press `Fetch now`.
17. Confirm new enabled feeds are automatically scheduled.
18. Wait for the scheduled job.
19. Confirm eligible feeds produce SCHEDULED runs.
20. Confirm paused feeds are skipped.
21. Confirm archived feeds are skipped.
22. Confirm normalized items form one mixed chronological stream.
23. Confirm items are not grouped beneath source cards.
24. Confirm duplicate items appear once.
25. Confirm source provenance is visible.
26. Mark one item read.
27. Mark that item unread.
28. Save one item.
29. Unsave one item.
30. Dismiss one item.
31. Restore one dismissed item.
32. Confirm each feed mode works.
33. Confirm source filter works.
34. Confirm date filter works.
35. Confirm text search works.
36. Confirm keyset pagination does not duplicate or skip equal-time items.
37. Send one item to an owned Investigation.
38. Confirm the linked item appears there.
39. Confirm no Source was automatically created.
40. Confirm no Evidence was automatically created.
41. Confirm no Graph relationship was automatically created.
42. Unlink the item.
43. Confirm the global item remains intact.
44. Pause a feed and confirm scheduling stops.
45. Enable it and confirm scheduling resumes.
46. Disable automatic scheduling and confirm manual fetch remains available.
47. Archive and restore a feed.
48. Confirm restore leaves it paused.
49. Verify second-user feed denial.
50. Verify second-user item denial.
51. Verify second-user state-action denial.
52. Verify second-user Investigation-link denial.
53. Verify missing scheduler secret rejection.
54. Verify invalid scheduler secret rejection.
55. Verify valid scheduler secret acceptance.
56. Verify no raw URL query values appear in UI or logs.
57. Verify no resolved IP appears in UI or logs.
58. Verify no headers, bodies, XML, or secrets appear in UI or logs.
59. Confirm MANUAL and SCHEDULED run types.
60. Confirm one scheduled failure does not stop another feed.

## Limitations and exclusions
Live Supabase, Preview deployment, and scheduler operation require the checklist. This phase excludes private/authenticated feeds, scraping or article crawling, extraction/AI tagging, alerts, teams, automatic analytical entities/Evidence/Sources/relationships/attribution, Phase 2.2C, ANLAK, and KARARGÂH.

## Phase 2.2C continuity
The Intelligence Feed and Settings drawer remain the default `/osint?view=feed` experience. Phase 2.2C adds a sibling, common IOC Inbox rather than changing feed trust or linking behavior.
