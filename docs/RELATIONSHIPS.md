# Phase 3 CTI Relationship Model

All CTI relationships are explicit, project-scoped join tables. Each join table carries `project_id`, uses a unique pair constraint, and has composite foreign keys to both sides so a relationship cannot link records from different projects.

| Join table | Side A | Side B | Purpose |
| --- | --- | --- | --- |
| `campaign_threat_actors` | `campaigns` | `threat_actors` | Attributes campaigns to one or more actors. |
| `threat_actor_malware` | `threat_actors` | `malware` | Links actors to malware they use or develop. |
| `threat_actor_indicators` | `threat_actors` | `indicators` | Links actors to known IOCs. |
| `campaign_malware` | `campaigns` | `malware` | Tracks malware observed in campaigns. |
| `campaign_indicators` | `campaigns` | `indicators` | Tracks IOCs observed in campaigns. |
| `malware_indicators` | `malware` | `indicators` | Links malware samples/families to IOCs. |
| `cve_malware` | `cves` | `malware` | Tracks malware exploiting vulnerabilities. |
| `threat_actor_mitre_techniques` | `threat_actors` | `mitre_techniques` | Maps actor behavior to ATT&CK techniques. |
| `campaign_mitre_techniques` | `campaigns` | `mitre_techniques` | Maps campaign behavior to ATT&CK techniques. |
| `malware_mitre_techniques` | `malware` | `mitre_techniques` | Maps malware behavior to ATT&CK techniques. |

RLS policies on every entity and join table authorize through the parent project owner. Server actions additionally verify the session, project ownership, entity ownership, and related-entity ownership before changing relationship rows.

## Atomic replacement

Relationship edits call `public.replace_cti_relationships`, an authenticated PostgreSQL function that verifies project ownership, edited entity membership, and every submitted related ID before replacing any allowed relationship set. Because validation, deletion, and insertion happen inside one PostgreSQL function call, failures leave prior relationship rows unchanged.
