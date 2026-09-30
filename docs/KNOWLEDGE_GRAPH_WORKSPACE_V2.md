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
