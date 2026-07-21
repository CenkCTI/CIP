import { describe, expect, it } from "vitest";
import fs from "node:fs";
import {
  deterministicPosition,
  filterGraph,
  preservedPosition,
  syncRelationshipFilters,
} from "@/lib/graph/filters";
import {
  addUniqueGraphEdge,
  limitGraph,
  semanticJoinDefs,
} from "@/lib/graph/service";
import {
  manualRelationshipSchema,
  nodeId,
  type GraphEdge,
  type GraphNode,
} from "@/lib/graph/types";

const nodes: GraphNode[] = [
  {
    id: "actor:a",
    entityId: "a",
    type: "ACTOR",
    label: "APT One",
    detailUrl: "/a",
    metadata: {},
  },
  {
    id: "malware:m",
    entityId: "m",
    type: "MALWARE",
    label: "BadRat",
    detailUrl: "/m",
    metadata: {},
  },
];
const edges: GraphEdge[] = [
  {
    id: "semantic:x",
    source: "actor:a",
    target: "malware:m",
    relationshipType: "uses",
    sourceKind: "semantic",
    detailUrl: "/projects/p/actors/a",
  },
];

describe("knowledge graph helpers", () => {
  it("uses prefixed node ids", () =>
    expect(nodeId("ACTOR", "same")).not.toBe(nodeId("MALWARE", "same")));

  it("filters nodes and affected edges", () => {
    const out = filterGraph(nodes, edges, {
      query: "apt",
      types: ["ACTOR", "MALWARE"],
      relationshipTypes: ["uses"],
    });
    expect(out.nodes).toHaveLength(1);
    expect(out.edges).toHaveLength(0);
  });

  it("relationship and type filters can explicitly show none", () => {
    expect(
      filterGraph(nodes, edges, { types: [], relationshipTypes: ["uses"] })
        .nodes,
    ).toHaveLength(0);
    expect(
      filterGraph(nodes, edges, {
        types: ["ACTOR", "MALWARE"],
        relationshipTypes: [],
      }).edges,
    ).toHaveLength(0);
  });

  it("has deterministic layout", () =>
    expect(deterministicPosition(3, 9)).toEqual(deterministicPosition(3, 9)));

  it("rejects manual self links and validates labels", () => {
    expect(
      manualRelationshipSchema.safeParse({
        sourceType: "ACTOR",
        sourceId: "11111111-1111-4111-8111-111111111111",
        targetType: "ACTOR",
        targetId: "11111111-1111-4111-8111-111111111111",
        relationshipType: "related_to",
      }).success,
    ).toBe(false);
    expect(
      manualRelationshipSchema.safeParse({
        sourceType: "ACTOR",
        sourceId: "11111111-1111-4111-8111-111111111111",
        targetType: "MALWARE",
        targetId: "22222222-2222-4222-8222-222222222222",
        relationshipType: "uses",
      }).success,
    ).toBe(true);
    expect(
      manualRelationshipSchema.safeParse({
        sourceType: "ACTOR",
        sourceId: "11111111-1111-4111-8111-111111111111",
        targetType: "MALWARE",
        targetId: "22222222-2222-4222-8222-222222222222",
        relationshipType: " uses",
      }).success,
    ).toBe(true);
    expect(
      manualRelationshipSchema.safeParse({
        sourceType: "ACTOR",
        sourceId: "11111111-1111-4111-8111-111111111111",
        targetType: "MALWARE",
        targetId: "22222222-2222-4222-8222-222222222222",
        relationshipType: "bad<script>",
      }).success,
    ).toBe(false);
  });

  it("all ten semantic join-table mappings are explicit and route to CTI detail UIs", () => {
    expect(semanticJoinDefs).toHaveLength(10);
    expect(semanticJoinDefs.map((join) => join[0])).toEqual([
      "campaign_threat_actors",
      "threat_actor_malware",
      "threat_actor_indicators",
      "campaign_malware",
      "campaign_indicators",
      "malware_indicators",
      "cve_malware",
      "threat_actor_mitre_techniques",
      "campaign_mitre_techniques",
      "malware_mitre_techniques",
    ]);
    expect(semanticJoinDefs.every((join) => Boolean(join[6]))).toBe(true);
  });

  it("global limits never return dangling edges and keep metadata consistent", () => {
    const graphNodes = Array.from(
      { length: 501 },
      (_, i): GraphNode => ({
        id: `actor:${i}`,
        entityId: String(i),
        type: "ACTOR",
        label: `Actor ${i}`,
        detailUrl: `/a/${i}`,
        metadata: {},
      }),
    );
    const graphEdges: GraphEdge[] = [
      {
        id: "ok",
        source: "actor:0",
        target: "actor:1",
        relationshipType: "related_to",
        sourceKind: "manual",
      },
      {
        id: "dangling",
        source: "actor:0",
        target: "actor:500",
        relationshipType: "related_to",
        sourceKind: "manual",
      },
    ];
    const out = limitGraph(graphNodes, graphEdges);
    expect(out.nodes).toHaveLength(500);
    expect(out.edges).toEqual([graphEdges[0]]);
    expect(out.meta.nodeCount).toBe(501);
    expect(out.meta.edgeCount).toBe(2);
    expect(out.meta.omittedNodes).toBe(1);
    expect(out.meta.omittedEdges).toBe(1);
    expect(out.meta.truncated).toBe(true);
  });

  it("preserves dragged positions during selection/style updates", () => {
    const existing = new Map([
      ["actor:a", { id: "actor:a", position: { x: 99, y: 101 } }],
    ]);
    expect(preservedPosition(existing, "actor:a", { x: 0, y: 0 })).toEqual({
      x: 99,
      y: 101,
    });
    expect(preservedPosition(existing, "missing", { x: 1, y: 2 })).toEqual({
      x: 1,
      y: 2,
    });
  });

  it("adds newly discovered relationship types without re-enabling unchecked existing types", () => {
    const known = new Set(["uses", "related_to"]);
    const synced = syncRelationshipFilters(["uses"], known, [
      "uses",
      "related_to",
      "new_label",
    ]);
    expect(synced.relationships).toEqual(["uses", "new_label"]);
    expect(
      syncRelationshipFilters([], synced.known, [
        "uses",
        "related_to",
        "new_label",
      ]).relationships,
    ).toEqual([]);
  });

  it("semantic edge deduplication removes identical rendered edges but keeps manual distinct", () => {
    const seen = new Set<string>();
    const out: GraphEdge[] = [];
    addUniqueGraphEdge(out, seen, edges[0]);
    addUniqueGraphEdge(out, seen, { ...edges[0], id: "semantic:dupe" });
    addUniqueGraphEdge(out, seen, {
      ...edges[0],
      id: "manual:1",
      sourceKind: "manual",
    });
    expect(out.map((edge) => edge.id)).toEqual(["semantic:x", "manual:1"]);
  });
});

describe("phase 4 migration", () => {
  const sql = fs.readFileSync(
    "supabase/migrations/202607210007_phase4_knowledge_graph.sql",
    "utf8",
  );
  it("adds database validation, RLS, duplicate rejection, and cleanup triggers for supported tables", () => {
    expect(sql).toContain("validate_entity_relationship");
    expect(sql).toContain("graph_entity_exists");
    expect(sql).toContain("entity_relationships_unique_exact");
    expect(sql).toContain("enable row level security");
    expect(sql).toContain(
      "where p.id = new.project_id and p.owner_id = auth.uid()",
    );
    expect(
      sql.indexOf("where p.id = new.project_id and p.owner_id = auth.uid()"),
    ).toBeLessThan(sql.indexOf("public.graph_entity_exists(new.project_id"));
    expect(sql).toContain("new.created_by <> old.created_by");
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain(
      "revoke all on function public.cleanup_entity_relationships() from public, anon, authenticated",
    );
    for (const table of [
      "threat_actors",
      "campaigns",
      "indicators",
      "malware",
      "cves",
      "mitre_techniques",
      "evidence",
    ])
      expect(sql).toContain(`before delete on public.${table}`);
  });

  it("keeps relationship_type constraint aligned with Zod", () => {
    expect(sql).toContain("relationship_type = btrim(relationship_type)");
    expect(sql).toContain("char_length(relationship_type) between 2 and 80");
    expect(sql).toContain("^[A-Za-z0-9][A-Za-z0-9 _.:/-]*$");
  });
});
