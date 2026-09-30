# Knowledge Graph Workspace v2

The Knowledge Graph keeps the existing graph data and relationship APIs but adopts the same CITEM visual and interaction hierarchy used by Timeline, Threat Actors, Campaigns, and Malware.

## Visual hierarchy

The graph now uses the CITEM charcoal / stone / amber system.

Entity categories retain muted type accents so nodes remain distinguishable without turning the workspace into a rainbow dashboard. Analyst-defined manual relationships use amber; semantic CITEM relationships use neutral stone.

Emoji node icons and the previous bright cyan / purple interaction language are removed.

## Default workspace

The default surface provides:

- an analytical-map header with entity and relationship counts;
- a compact search bar;
- **Fit view** and **Reset view** controls;
- entity and relationship filters behind a collapsed **Filters** surface;
- a large graph canvas;
- a persistent right-side inspector on wide screens.

Historical rejected / removed infrastructure memberships remain opt-in.

## Entity inspection

Clicking an entity label opens an **Entity inspector** with:

- entity type;
- subtitle/context;
- exposed graph metadata;
- a direct link to the owning CITEM entity workspace.

The inspector does not pretend graph metadata is an independent analytical assessment.

## Manual relationships

Manual graph relationships remain explicit analyst actions.

Selecting two nodes opens a dedicated relationship-selection surface showing:

- Source;
- Target;
- a direction swap action;
- relationship type;
- optional analyst description;
- **Create link**.

Manual relationships remain visually distinct and editable. Semantic CTI relationships are still managed by their owning CITEM workspaces.

## Layout behavior

Dragged node positions continue to persist through the existing graph layout API. **Reset view** clears saved layout positions and active graph filters. **Fit view** only changes the current viewport.

No database migration is required for this redesign.
