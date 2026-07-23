import { actorSchema, campaignSchema, cveSchema, malwareSchema } from "@/lib/cti-schema";

export type AiEntityType = "actors" | "malware" | "campaigns" | "cves";

export function buildEntityApprovalPayload(entityType: AiEntityType, name: string, description = "") {
  if (entityType === "actors") {
    const payload = actorSchema.parse({ name, description, aliases: [], motivations: [], known_ttps: "", references: [] });
    return { table: "threat_actors" as const, uniqueCol: "name" as const, uniqueValue: payload.name, payload };
  }
  if (entityType === "campaigns") {
    const payload = campaignSchema.parse({ name, description, start_date: null, end_date: null, targets: [] });
    return { table: "campaigns" as const, uniqueCol: "name" as const, uniqueValue: payload.name, payload };
  }
  if (entityType === "malware") {
    const payload = malwareSchema.parse({ name, description, hashes: "{}", behavior: "" });
    return { table: "malware" as const, uniqueCol: "name" as const, uniqueValue: payload.name, payload };
  }
  const payload = cveSchema.parse({ cve_id: name, description, severity: "LOW", affected_product: "", exploit_status: "NONE", references: [] });
  return { table: "cves" as const, uniqueCol: "cve_id" as const, uniqueValue: payload.cve_id, payload };
}
