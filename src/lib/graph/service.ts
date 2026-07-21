import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import {
  entityTableMap,
  type GraphEdge,
  type GraphEntityType,
  type GraphNode,
  type GraphResponse,
  nodeId,
} from "./types";

type Row = Record<string, unknown>;
const NODE_LIMIT = 500;
const EDGE_LIMIT = 1500;
const s = (v: unknown) => String(v ?? "");
const count = (v: unknown) => (Array.isArray(v) ? v.length : 0);
const safeMeta = (r: Row, keys: string[]) =>
  Object.fromEntries(
    keys.map((key) => [
      key,
      Array.isArray(r[key]) ? count(r[key]) : r[key] == null ? null : s(r[key]),
    ]),
  );
const defs: {
  type: GraphEntityType;
  table: string;
  select: string;
  order: string;
  title: (r: Row) => string;
  sub: (r: Row) => string | undefined;
  url: (projectId: string, id: string) => string;
  meta: string[];
}[] = [
  {
    type: "ACTOR",
    table: "threat_actors",
    select: "id,name,aliases,country,motivations,updated_at",
    order: "name",
    title: (r) => s(r.name),
    sub: (r) => s(r.country) || undefined,
    url: (projectId, id) => `/projects/${projectId}/actors/${id}`,
    meta: ["country", "updated_at"],
  },
  {
    type: "CAMPAIGN",
    table: "campaigns",
    select: "id,name,start_date,end_date,targets,updated_at",
    order: "name",
    title: (r) => s(r.name),
    sub: (r) =>
      [r.start_date, r.end_date].filter(Boolean).join(" → ") || undefined,
    url: (projectId, id) => `/projects/${projectId}/campaigns/${id}`,
    meta: ["start_date", "end_date", "updated_at"],
  },
  {
    type: "INDICATOR",
    table: "indicators",
    select: "id,value,type,confidence,tags,first_seen,last_seen",
    order: "normalized_value",
    title: (r) => s(r.value),
    sub: (r) => `${s(r.type)} · ${s(r.confidence)}`,
    url: (projectId, id) => `/projects/${projectId}/indicators/${id}`,
    meta: ["type", "confidence", "first_seen", "last_seen"],
  },
  {
    type: "MALWARE",
    table: "malware",
    select: "id,name,family,updated_at",
    order: "name",
    title: (r) => s(r.name),
    sub: (r) => s(r.family) || undefined,
    url: (projectId, id) => `/projects/${projectId}/malware/${id}`,
    meta: ["family", "updated_at"],
  },
  {
    type: "CVE",
    table: "cves",
    select: "id,cve_id,severity,affected_product,exploit_status,updated_at",
    order: "cve_id",
    title: (r) => s(r.cve_id),
    sub: (r) => `${s(r.severity)} · ${s(r.exploit_status)}`,
    url: (projectId, id) => `/projects/${projectId}/cves/${id}`,
    meta: ["severity", "affected_product", "exploit_status"],
  },
  {
    type: "MITRE",
    table: "mitre_techniques",
    select: "id,technique_id,technique_name,tactic,updated_at",
    order: "technique_id",
    title: (r) => `${s(r.technique_id)} ${s(r.technique_name)}`.trim(),
    sub: (r) => s(r.tactic) || undefined,
    url: (projectId, id) => `/projects/${projectId}/mitre/${id}`,
    meta: ["technique_id", "tactic"],
  },
  {
    type: "EVIDENCE",
    table: "evidence",
    select: "id,title,type,collection_date,tags,created_at",
    order: "title",
    title: (r) => s(r.title),
    sub: (r) => s(r.type) || undefined,
    url: (projectId, id) =>
      `/projects/${projectId}?tab=evidence#evidence-${id}`,
    meta: ["type", "collection_date", "created_at"],
  },
];
export const semanticJoinDefs = [
  [
    "campaign_threat_actors",
    "CAMPAIGN",
    "campaign_id",
    "ACTOR",
    "threat_actor_id",
    "attributed_to",
    "campaigns",
  ],
  [
    "threat_actor_malware",
    "ACTOR",
    "threat_actor_id",
    "MALWARE",
    "malware_id",
    "uses",
    "actors",
  ],
  [
    "threat_actor_indicators",
    "ACTOR",
    "threat_actor_id",
    "INDICATOR",
    "indicator_id",
    "associated_ioc",
    "actors",
  ],
  [
    "campaign_malware",
    "CAMPAIGN",
    "campaign_id",
    "MALWARE",
    "malware_id",
    "uses",
    "campaigns",
  ],
  [
    "campaign_indicators",
    "CAMPAIGN",
    "campaign_id",
    "INDICATOR",
    "indicator_id",
    "observed_ioc",
    "campaigns",
  ],
  [
    "malware_indicators",
    "MALWARE",
    "malware_id",
    "INDICATOR",
    "indicator_id",
    "has_ioc",
    "malware",
  ],
  [
    "cve_malware",
    "CVE",
    "cve_id",
    "MALWARE",
    "malware_id",
    "exploited_by",
    "cves",
  ],
  [
    "threat_actor_mitre_techniques",
    "ACTOR",
    "threat_actor_id",
    "MITRE",
    "mitre_technique_id",
    "uses_technique",
    "actors",
  ],
  [
    "campaign_mitre_techniques",
    "CAMPAIGN",
    "campaign_id",
    "MITRE",
    "mitre_technique_id",
    "uses_technique",
    "campaigns",
  ],
  [
    "malware_mitre_techniques",
    "MALWARE",
    "malware_id",
    "MITRE",
    "mitre_technique_id",
    "implements_technique",
    "malware",
  ],
] as const;

export function addUniqueGraphEdge(
  edges: GraphEdge[],
  seen: Set<string>,
  edge: GraphEdge,
) {
  const key = `${edge.source}|${edge.target}|${edge.relationshipType}|${edge.sourceKind}`;
  if (!seen.has(key)) {
    seen.add(key);
    edges.push(edge);
  }
}

export function limitGraph(
  nodes: GraphNode[],
  edges: GraphEdge[],
  totalNodeCount = nodes.length,
  totalEdgeCount = edges.length,
): GraphResponse {
  const finalNodes = nodes.slice(0, NODE_LIMIT);
  const nodeSet = new Set(finalNodes.map((node) => node.id));
  const validEdges = edges.filter(
    (edge) => nodeSet.has(edge.source) && nodeSet.has(edge.target),
  );
  const finalEdges = validEdges.slice(0, EDGE_LIMIT);
  const omittedNodes = Math.max(0, totalNodeCount - finalNodes.length);
  const omittedEdges = Math.max(0, totalEdgeCount - finalEdges.length);
  return {
    nodes: finalNodes,
    edges: finalEdges,
    meta: {
      nodeCount: totalNodeCount,
      edgeCount: totalEdgeCount,
      truncated: omittedNodes > 0 || omittedEdges > 0,
      nodeLimit: NODE_LIMIT,
      edgeLimit: EDGE_LIMIT,
      omittedNodes,
      omittedEdges,
    },
  };
}

export async function loadProjectGraph(
  projectId: string,
): Promise<GraphResponse> {
  const { supabase, user } = await requireUser();
  const { data: project, error } = await supabase
    .from("projects")
    .select("id,owner_id")
    .eq("id", projectId)
    .single();
  if (error || !project || project.owner_id !== user.id) notFound();

  const entityResults = await Promise.all(
    defs.map((def) =>
      supabase
        .from(def.table)
        .select(def.select, { count: "exact" })
        .eq("project_id", projectId)
        .order(def.order, { ascending: true })
        .order("id", { ascending: true })
        .limit(NODE_LIMIT + 1),
    ),
  );
  if (entityResults.some((result) => result.error)) {
    throw new Error("Unable to load graph entities.");
  }

  const nodes = defs.flatMap((def, index) =>
    ((entityResults[index].data ?? []) as unknown as Row[]).map((row) => ({
      id: nodeId(def.type, s(row.id)),
      entityId: s(row.id),
      type: def.type,
      label: def.title(row),
      subtitle: def.sub(row),
      detailUrl: def.url(projectId, s(row.id)),
      metadata: safeMeta(row, def.meta),
    })),
  );
  const totalNodeCount = entityResults.reduce(
    (total, result) => total + (result.count ?? result.data?.length ?? 0),
    0,
  );
  const finalNodeSet = new Set(
    nodes.slice(0, NODE_LIMIT).map((node) => node.id),
  );
  const edges: GraphEdge[] = [];
  const seen = new Set<string>();

  const joinResults = await Promise.all(
    semanticJoinDefs.map((join) =>
      supabase
        .from(join[0])
        .select("id," + join[2] + "," + join[4], { count: "exact" })
        .eq("project_id", projectId)
        .order("id", { ascending: true })
        .limit(EDGE_LIMIT + 1),
    ),
  );
  if (joinResults.some((result) => result.error)) {
    throw new Error("Unable to load graph relationships.");
  }
  semanticJoinDefs.forEach((join, index) => {
    for (const row of (joinResults[index].data ?? []) as unknown as Row[]) {
      const source = nodeId(join[1], s(row[join[2]]));
      const target = nodeId(join[3], s(row[join[4]]));
      if (finalNodeSet.has(source) && finalNodeSet.has(target)) {
        addUniqueGraphEdge(edges, seen, {
          id: `semantic:${join[0]}:${s(row.id)}`,
          source,
          target,
          relationshipType: join[5],
          sourceKind: "semantic",
          detailUrl: `/projects/${projectId}/${join[6]}/${s(row[join[2]])}`,
        });
      }
    }
  });

  const {
    data: manual,
    error: manualError,
    count: manualCount,
  } = await supabase
    .from("entity_relationships")
    .select(
      "id,source_type,source_id,target_type,target_id,relationship_type,description",
      { count: "exact" },
    )
    .eq("project_id", projectId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(EDGE_LIMIT + 1);
  if (manualError && manualError.code !== "42P01") {
    throw new Error("Unable to load manual relationships.");
  }
  for (const row of (manual ?? []) as unknown as Row[]) {
    const source = nodeId(row.source_type as GraphEntityType, s(row.source_id));
    const target = nodeId(row.target_type as GraphEntityType, s(row.target_id));
    if (finalNodeSet.has(source) && finalNodeSet.has(target)) {
      addUniqueGraphEdge(edges, seen, {
        id: `manual:${s(row.id)}`,
        source,
        target,
        relationshipType: s(row.relationship_type),
        sourceKind: "manual",
        description: s(row.description) || undefined,
      });
    }
  }

  const totalSemanticEdgeCount = joinResults.reduce(
    (total, result) => total + (result.count ?? result.data?.length ?? 0),
    0,
  );
  const totalManualEdgeCount = manualError
    ? 0
    : (manualCount ?? manual?.length ?? 0);
  return limitGraph(
    nodes,
    edges,
    totalNodeCount,
    totalSemanticEdgeCount + totalManualEdgeCount,
  );
}

export async function assertGraphEntity(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  projectId: string,
  type: GraphEntityType,
  id: string,
) {
  const { data, error } = await supabase
    .from(entityTableMap[type])
    .select("id")
    .eq("project_id", projectId)
    .eq("id", id)
    .single();
  if (error || !data) notFound();
}

export async function assertGraphEntities(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  projectId: string,
  positions: { entityType: GraphEntityType; entityId: string }[],
) {
  const byType = new Map<GraphEntityType, Set<string>>();
  for (const position of positions) {
    const ids = byType.get(position.entityType) ?? new Set<string>();
    ids.add(position.entityId);
    byType.set(position.entityType, ids);
  }
  await Promise.all(
    Array.from(byType.entries()).map(async ([type, ids]) => {
      const wanted = Array.from(ids);
      const { data, error } = await supabase
        .from(entityTableMap[type])
        .select("id")
        .eq("project_id", projectId)
        .in("id", wanted);
      if (error) notFound();
      const found = new Set(
        ((data ?? []) as { id: string }[]).map((row) => row.id),
      );
      if (wanted.some((id) => !found.has(id))) notFound();
    }),
  );
}
