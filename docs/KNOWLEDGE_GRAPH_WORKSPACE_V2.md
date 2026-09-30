# Knowledge Graph Workspace v2

The Knowledge Graph is a full-surface analytical map inside the Investigation workspace. It keeps the existing graph data, saved-layout API and manual-relationship API while using CITEM's charcoal / stone / amber visual language.

## Full-bleed map surface

When the Graph tab is active, the normal Investigation page width and project-title treatment are removed from the content body. The Graph consumes the available horizontal surface and a viewport-height map area. Tabs / application navigation remain outside the map.

There is no persistent Graph Inspector. The previous right-side inspector was removed so it cannot cover or permanently reduce the analytical map.

## Progressive map labels

Normal zoom renders framed entity cards.

At broad overview zoom, framed cards switch to compact map labels:

- the frame disappears instead of shrinking into a tiny unreadable rectangle;
- entity names are counter-scaled within a bounded range;
- long hashes, IOC values and names are compacted with ellipsis;
- subtitles and secondary metadata disappear;
- entity type remains visible as a small color marker;
- clicking the map label opens the entity's owning CITEM workspace.

Relationship labels hide at broad zoom and return as the analyst zooms closer.

## Filters and controls

The default map remains visually clean. Search and filter controls are hidden until the analyst opens **Filters**.

The overlay contains:

- entity search;
- entity-type filters;
- relationship-type filters;
- historical infrastructure membership toggle.

Fit and reset controls remain immediately available. Active filtering is indicated on the Filters button.

## Depth-aware terrain

The Graph background is no longer a fixed screen texture.

Two vector/CSS terrain layers use large amber, jade and desaturated survey-map gradients. The layers follow the React Flow viewport with different parallax factors:

- the far terrain uses reduced translation and `zoom^0.34`;
- the mid terrain uses a stronger, but still reduced, translation and `zoom^0.58`;
- entities continue to use the normal React Flow transform.

This makes the terrain pan and zoom with the map while moving more slowly than foreground entities, producing a restrained depth / distant-map effect. CSS gradients remain resolution-independent at high display resolution.

Visible node degree still contributes subtle local contour depth around highly connected entities. This is a visualization of **connection density only** and does not mean confidence, severity, attribution strength or analytical importance.

## Manual relationships

Selecting two nodes opens a temporary bottom relationship panel. Source and Target remain explicit, direction can be swapped, and relationship type / description are analyst-controlled.

Clicking an analyst-defined edge opens a temporary edit panel. Semantic CITEM relationships continue to be managed from their owning workspaces.

## Preserved behavior

- saved node positions;
- reset-layout API;
- graph truncation warning;
- MiniMap and zoom controls;
- historical infrastructure opt-in;
- analyst-defined relationship create / edit / delete;
- semantic relationship ownership.

No database migration is required.


## Full-width and terrain-continuity correction

The Graph route had an earlier dedicated return path that still wrapped the map in `max-w-6xl`; that path bypassed the later full-width styling. The active Graph route now renders through `.citem-graph-bleed`, which escapes the global `citem-content` max-width and uses the full available main-shell width. When the sidebar is collapsed it expands to the full viewport width; when the sidebar is open it respects the sidebar's 17.25rem footprint.

The map now starts flush beneath the top bar and uses `calc(100dvh - 4.35rem)` height.

The parallax terrain layers also use substantial overscan (`85%` far layer and `105%` mid layer). This is necessary because the depth effect scales the background more slowly than graph entities: at low graph zoom a smaller terrain transform can otherwise expose the edge of its DOM layer. Additional amber/jade contour origins at the top, left, right and lower field keep the topographic texture continuous across the entire map instead of appearing to begin partway down the canvas.
