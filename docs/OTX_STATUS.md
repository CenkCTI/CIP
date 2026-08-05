# AlienVault OTX status

Migrations 029 and 030 were already applied to the live Supabase database and are preserved here for migration-history consistency.

The AlienVault OTX application connector is not enabled on `main`. OTX global search and exact lookup failed bounded live acceptance because the upstream AlienVault OTX API did not return a response within the allowed timeout.

OTX is currently dormant and experimental. The presence of database schema support does not mean the application feature is production-ready.

PR #30 remains separate and must not be merged as part of this maintenance PR.

TechINT v1 does not depend on OTX.
