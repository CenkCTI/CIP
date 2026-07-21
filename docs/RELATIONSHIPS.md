# Project Relationship Model

## Phase 3 CTI semantic relationships

All CTI relationships are explicit, project-scoped join tables. Each join table carries `project_id`, uses a unique pair constraint, and has composite foreign keys to both sides so a relationship cannot link records from different projects.

| Join table | Side A | Side B | Graph relationship |
| --- | --- | --- | --- |
| `campaign_threat_actors` | `campaigns` | `threat_actors` | `attributed_to` |
| `threat_actor_malware` | `threat_actors` | `malware` | `uses` |
| `threat_actor_indicators` | `threat_actors` | `indicators` | `associated_ioc` |
| `campaign_malware` | `campaigns` | `malware` | `uses` |
| `campaign_indicators` | `campaigns` | `indicators` | `observed_ioc` |
| `malware_indicators` | `malware` | `indicators` | `has_ioc` |
| `cve_malware` | `cves` | `malware` | `exploited_by` |
| `threat_actor_mitre_techniques` | `threat_actors` | `mitre_techniques` | `uses_technique` |
| `campaign_mitre_techniques` | `campaigns` | `mitre_techniques` | `uses_technique` |
| `malware_mitre_techniques` | `malware` | `mitre_techniques` | `implements_technique` |

The graph maps all ten Phase 3 join tables explicitly. It never infers links from matching labels.

## Phase 4 manual analyst relationships

Manual graph links are stored in `public.entity_relationships`. Supported types are `ACTOR`, `CAMPAIGN`, `INDICATOR`, `MALWARE`, `CVE`, `MITRE`, and `EVIDENCE`. Reports are intentionally excluded until Phase 5 and can be added by extending the enum and entity map.

Manual relationships reject default self-links, reject exact duplicates by project/source/target/type, use authenticated project-owner RLS policies, set `created_by` to the current user, and verify both endpoint IDs exist in the same owned project before insertion. Polymorphic cleanup is handled by database delete triggers on every supported entity table, including Evidence, so deleting a referenced record removes its manual edges.

Graph payloads use prefixed IDs such as `actor:{uuid}` and `evidence:{uuid}`. Evidence graph nodes expose only metadata and the Evidence tab anchor; storage paths, upload tokens, and signed URLs are not included.
