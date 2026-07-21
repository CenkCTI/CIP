import { describe, expect, it } from "vitest";
import { deterministicPosition, filterGraph } from "@/lib/graph/filters";
import { manualRelationshipSchema, nodeId } from "@/lib/graph/types";
import fs from "node:fs";
const n = [ { id:"actor:a", entityId:"a", type:"ACTOR" as const, label:"APT One", detailUrl:"/a", metadata:{} }, { id:"malware:m", entityId:"m", type:"MALWARE" as const, label:"BadRat", detailUrl:"/m", metadata:{} } ];
const e = [ { id:"semantic:x", source:"actor:a", target:"malware:m", relationshipType:"uses", sourceKind:"semantic" as const } ];
describe("knowledge graph helpers", () => {
 it("uses prefixed node ids", () => expect(nodeId("ACTOR","same")).not.toBe(nodeId("MALWARE","same")));
 it("filters nodes and affected edges", () => { const out=filterGraph(n,e,{query:"apt",types:["ACTOR","MALWARE"],relationshipTypes:["uses"]}); expect(out.nodes).toHaveLength(1); expect(out.edges).toHaveLength(0); });
 it("has deterministic layout", () => expect(deterministicPosition(3,9)).toEqual(deterministicPosition(3,9)));
 it("rejects manual self links and validates labels", () => { expect(manualRelationshipSchema.safeParse({sourceType:"ACTOR",sourceId:"11111111-1111-4111-8111-111111111111",targetType:"ACTOR",targetId:"11111111-1111-4111-8111-111111111111",relationshipType:"related_to"}).success).toBe(false); expect(manualRelationshipSchema.safeParse({sourceType:"ACTOR",sourceId:"11111111-1111-4111-8111-111111111111",targetType:"MALWARE",targetId:"22222222-2222-4222-8222-222222222222",relationshipType:"uses"}).success).toBe(true); });
});
describe("phase 4 migration", () => {
 const sql = fs.readFileSync("supabase/migrations/202607210007_phase4_knowledge_graph.sql","utf8");
 it("adds RLS, duplicate rejection, and cleanup triggers for supported tables", () => { expect(sql).toContain("entity_relationships_unique_exact"); expect(sql).toContain("enable row level security"); for (const t of ["threat_actors","campaigns","indicators","malware","cves","mitre_techniques","evidence"]) expect(sql).toContain(`before delete on public.${t}`); });
});
