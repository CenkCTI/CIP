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


## Wide-map and readability pass

The graph now expands beyond the normal Investigation content width and uses a viewport-height canvas. On wide screens the inspector floats over the map rather than consuming a permanent graph column.

Zoomed-out overview behavior is adaptive:

- node labels are counter-scaled below overview zoom thresholds so names remain readable from a wider perspective;
- subtitles and secondary node metadata collapse at broad zoom levels to reduce label collisions;
- relationship labels hide at broad zoom levels and reappear when the analyst moves closer;
- the minimum zoom remains broad enough for an overview while avoiding effectively unreadable micro-text.

## Topographic connection-density layer

The map background now combines a restrained survey-grid / contour texture with data-driven node contours.

For the currently visible graph, node degree is calculated from visible relationships. Higher-degree entities receive additional concentric contour halos. These halos are deliberately subtle and do not represent confidence, severity, attribution, or importance; they only visualize local **connection density**.

This makes graph hubs read more like elevated terrain on a topographic map while preserving the underlying semantic and analyst-defined relationship model.
