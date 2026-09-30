# Actors Workspace v2

Actors is a lightweight Threat Actor identity/profile surface. It records how an actor is tracked inside an Investigation without turning the profile itself into an attribution conclusion.

## Default workflow

The Actors tab now presents compact profile cards and a focused **Add actor** modal. Normal creation captures:

- canonical tracked name;
- aliases;
- factual profile description.

Reported association and motivations are available under **Advanced profile context**. The UI deliberately labels country context as **Reported association** and states that it is not an independent CITEM attribution assessment.

Legacy free-text `known_ttps` and raw `references` remain in the database for compatibility, but they are removed from the normal Actor editing workflow. Editing the simplified profile preserves those fields instead of silently clearing them.

## Relationships

Actor detail no longer exposes the generic checkbox relationship editor. Technical relationships are managed under one collapsed **Advanced links & context** panel with quick linking for:

- MITRE Techniques;
- Malware;
- Indicators.

The server validates project ownership and same-Investigation existence before mutation. Campaign attribution is intentionally not quick-linked from the Actor profile.

## Actor detail

The profile header emphasizes identity, aliases, description, reported context and concise relationship counts. The page separately exposes:

- Campaign relationships already present in the Investigation;
- MITRE Techniques;
- Malware;
- Indicators;
- Attribution hypotheses and links back to Attribution Analysis.

This preserves the boundary between descriptive profile context and analyst attribution judgement.

## Design

The workspace follows the current CITEM visual system: charcoal panels, restrained amber accents, compact badges, modal editing and secondary controls hidden until needed. Large cyan database-style forms and always-visible relationship checkbox grids are removed from the Actor workflow.
