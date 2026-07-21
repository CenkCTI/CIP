import { z } from "zod";

export const graphEntityTypes = [
  "ACTOR",
  "CAMPAIGN",
  "INDICATOR",
  "MALWARE",
  "CVE",
  "MITRE",
  "EVIDENCE",
] as const;
export type GraphEntityType = (typeof graphEntityTypes)[number];
export type GraphSourceKind = "semantic" | "manual";
export type GraphNode = {
  id: string;
  entityId: string;
  type: GraphEntityType;
  label: string;
  subtitle?: string;
  detailUrl: string;
  metadata: Record<string, string | number | boolean | null>;
};
export type GraphEdge = {
  id: string;
  source: string;
  target: string;
  relationshipType: string;
  sourceKind: GraphSourceKind;
  description?: string;
  detailUrl?: string;
};
export type GraphResponse = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  meta: {
    nodeCount: number;
    edgeCount: number;
    truncated: boolean;
    nodeLimit: number;
    edgeLimit: number;
    omittedNodes: number;
    omittedEdges: number;
  };
};
export const manualRelationshipSchema = z
  .object({
    sourceType: z.enum(graphEntityTypes),
    sourceId: z.string().uuid(),
    targetType: z.enum(graphEntityTypes),
    targetId: z.string().uuid(),
    relationshipType: z
      .string()
      .trim()
      .min(2)
      .max(80)
      .regex(/^[A-Za-z0-9][A-Za-z0-9 _.:/-]*$/),
    description: z
      .string()
      .trim()
      .max(2000)
      .optional()
      .transform((v) => v || null),
  })
  .refine((v) => v.sourceType !== v.targetType || v.sourceId !== v.targetId, {
    message: "Self-links are not allowed by default.",
  });
export const manualRelationshipUpdateSchema = z.object({
  relationshipType: manualRelationshipSchema.shape.relationshipType,
  description: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((v) => v || null),
});
export const graphPrefix: Record<GraphEntityType, string> = {
  ACTOR: "actor",
  CAMPAIGN: "campaign",
  INDICATOR: "indicator",
  MALWARE: "malware",
  CVE: "cve",
  MITRE: "mitre",
  EVIDENCE: "evidence",
};
export function nodeId(type: GraphEntityType, id: string) {
  return `${graphPrefix[type]}:${id}`;
}

export type GraphNodePosition = {
  entityType: GraphEntityType;
  entityId: string;
  x: number;
  y: number;
};
const coordinate = z.number().finite().min(-1000000).max(1000000);
export const graphLayoutPositionSchema = z.object({
  entityType: z.enum(graphEntityTypes),
  entityId: z.string().uuid(),
  x: coordinate,
  y: coordinate,
});
export const graphLayoutPatchSchema = z.object({
  positions: z.array(graphLayoutPositionSchema).min(1).max(500),
});

export const entityTableMap: Record<GraphEntityType, string> = {
  ACTOR: "threat_actors",
  CAMPAIGN: "campaigns",
  INDICATOR: "indicators",
  MALWARE: "malware",
  CVE: "cves",
  MITRE: "mitre_techniques",
  EVIDENCE: "evidence",
};
