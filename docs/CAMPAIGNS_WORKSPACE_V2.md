# Campaigns Workspace v2

Campaigns v2 aligns Campaign identity and reconstruction with the simplified CITEM Stage 3 workspace language used by Timeline and Threat Actors.

## Directory

The Campaigns tab no longer opens with the generic CTI creation form.

The default surface now provides:

- a compact operational-activity header;
- **+ Add campaign** as a focused modal action;
- search and sort controls;
- date/activity filtering under **Advanced filters**;
- compact Campaign cards with timeframe, target context and relationship counts.

Campaign cards use the CITEM charcoal / stone / amber hierarchy. Cyan database-style emphasis is removed from the normal Campaign workflow.

## Create / edit Campaign

Normal Campaign creation captures only Campaign identity and factual context:

- name;
- description;
- optional start and end dates;
- optional targets / affected context.

Threat Actor, Malware, Indicator and MITRE relationship checkbox grids are not part of Campaign creation.

Campaign profile edits update only the Campaign record. They do not replace or clear existing relationship rows.

## Campaign detail

The generic database-field dump is replaced with a purpose-built Campaign profile header.

The detail workflow keeps existing capabilities but changes their hierarchy:

1. Campaign identity and timeframe;
2. compact Campaign Reconstruction summary;
3. ordered Timeline activity;
4. Infrastructure context;
5. technical context for MITRE Techniques, Malware and Indicators;
6. separate Attribution Analysis handoff;
7. recorded direct actor relationships under advanced context;
8. collapsed danger zone.

Reconstruction editing and Infrastructure linking remain available but are collapsed by default so they do not dominate the normal reading workflow.

## Epistemic boundary

Campaign identity, Timeline membership, technical relationships, reconstruction and attribution are separate analyst-controlled judgements.

Creating or editing a Campaign does not:

- assign a Threat Actor;
- create Timeline membership;
- infer MITRE Techniques;
- create Malware or Indicator relationships;
- assess reconstruction;
- select an attribution hypothesis.

Existing Campaign relationship and reconstruction data remains authoritative and is not removed by this UI redesign.
