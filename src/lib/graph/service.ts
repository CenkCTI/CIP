import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { type GraphEdge, type GraphEntityType, type GraphNode, type GraphResponse, entityTableMap, nodeId } from "./types";

type Row = Record<string, unknown>;
const NODE_LIMIT = 500, EDGE_LIMIT = 1500;
const s = (v: unknown) => String(v ?? "");
const count = (v: unknown) => Array.isArray(v) ? v.length : 0;
const safeMeta = (r: Row, keys: string[]) => Object.fromEntries(keys.map(k => [k, Array.isArray(r[k]) ? count(r[k]) : (r[k] == null ? null : s(r[k]))]));
const defs: {type: GraphEntityType; table: string; select: string; title: (r:Row)=>string; sub:(r:Row)=>string|undefined; url:(p:string,id:string)=>string; meta:string[]}[] = [
 {type:"ACTOR", table:"threat_actors", select:"id,name,aliases,country,motivations,updated_at", title:r=>s(r.name), sub:r=>s(r.country)||undefined, url:(p,id)=>`/projects/${p}/actors/${id}`, meta:["country","updated_at"]},
 {type:"CAMPAIGN", table:"campaigns", select:"id,name,start_date,end_date,targets,updated_at", title:r=>s(r.name), sub:r=>[r.start_date,r.end_date].filter(Boolean).join(" → ")||undefined, url:(p,id)=>`/projects/${p}/campaigns/${id}`, meta:["start_date","end_date","updated_at"]},
 {type:"INDICATOR", table:"indicators", select:"id,value,type,confidence,tags,first_seen,last_seen", title:r=>s(r.value), sub:r=>`${s(r.type)} · ${s(r.confidence)}`, url:(p,id)=>`/projects/${p}/indicators/${id}`, meta:["type","confidence","first_seen","last_seen"]},
 {type:"MALWARE", table:"malware", select:"id,name,family,updated_at", title:r=>s(r.name), sub:r=>s(r.family)||undefined, url:(p,id)=>`/projects/${p}/malware/${id}`, meta:["family","updated_at"]},
 {type:"CVE", table:"cves", select:"id,cve_id,severity,affected_product,exploit_status,updated_at", title:r=>s(r.cve_id), sub:r=>`${s(r.severity)} · ${s(r.exploit_status)}`, url:(p,id)=>`/projects/${p}/cves/${id}`, meta:["severity","affected_product","exploit_status"]},
 {type:"MITRE", table:"mitre_techniques", select:"id,technique_id,technique_name,tactic,updated_at", title:r=>`${s(r.technique_id)} ${s(r.technique_name)}`.trim(), sub:r=>s(r.tactic)||undefined, url:(p,id)=>`/projects/${p}/mitre/${id}`, meta:["technique_id","tactic"]},
 {type:"EVIDENCE", table:"evidence", select:"id,title,type,collection_date,tags,created_at", title:r=>s(r.title), sub:r=>s(r.type)||undefined, url:(p,id)=>`/projects/${p}?tab=evidence#evidence-${id}`, meta:["type","collection_date","created_at"]},
];
const joinDefs = [
 ["campaign_threat_actors","CAMPAIGN","campaign_id","ACTOR","threat_actor_id","attributed_to"], ["threat_actor_malware","ACTOR","threat_actor_id","MALWARE","malware_id","uses"],
 ["threat_actor_indicators","ACTOR","threat_actor_id","INDICATOR","indicator_id","associated_ioc"], ["campaign_malware","CAMPAIGN","campaign_id","MALWARE","malware_id","uses"],
 ["campaign_indicators","CAMPAIGN","campaign_id","INDICATOR","indicator_id","observed_ioc"], ["malware_indicators","MALWARE","malware_id","INDICATOR","indicator_id","has_ioc"],
 ["cve_malware","CVE","cve_id","MALWARE","malware_id","exploited_by"], ["threat_actor_mitre_techniques","ACTOR","threat_actor_id","MITRE","mitre_technique_id","uses_technique"],
 ["campaign_mitre_techniques","CAMPAIGN","campaign_id","MITRE","mitre_technique_id","uses_technique"], ["malware_mitre_techniques","MALWARE","malware_id","MITRE","mitre_technique_id","implements_technique"],
] as const;
function addEdge(edges: GraphEdge[], seen:Set<string>, e: GraphEdge) { const k = `${e.source}|${e.target}|${e.relationshipType}|${e.sourceKind}`; if (!seen.has(k)) { seen.add(k); edges.push(e); } }
export async function loadProjectGraph(projectId: string): Promise<GraphResponse> {
 const { supabase, user } = await requireUser();
 const { data: project, error } = await supabase.from("projects").select("id,owner_id").eq("id", projectId).single();
 if (error || !project || project.owner_id !== user.id) notFound();
 const entityResults = await Promise.all(defs.map(d => supabase.from(d.table).select(d.select).eq("project_id", projectId).limit(NODE_LIMIT + 1)));
 if (entityResults.some(r => r.error)) throw new Error("Unable to load graph entities.");
 const nodes: GraphNode[] = [];
 for (let i=0;i<defs.length;i++) for (const r of ((entityResults[i].data ?? []).slice(0, NODE_LIMIT) as unknown as Row[])) nodes.push({ id: nodeId(defs[i].type, s(r.id)), entityId:s(r.id), type:defs[i].type, label:defs[i].title(r), subtitle:defs[i].sub(r), detailUrl:defs[i].url(projectId,s(r.id)), metadata:safeMeta(r,defs[i].meta) });
 const nodeSet = new Set(nodes.map(n=>n.id)); const edges: GraphEdge[] = []; const seen = new Set<string>();
 const joinResults = await Promise.all(joinDefs.map(j => supabase.from(j[0]).select("*").eq("project_id", projectId).limit(EDGE_LIMIT + 1)));
 if (joinResults.some(r => r.error)) throw new Error("Unable to load graph relationships.");
 joinDefs.forEach((j,i)=> ((joinResults[i].data ?? []) as unknown as Row[]).forEach(r => { const source=nodeId(j[1],s(r[j[2]])), target=nodeId(j[3],s(r[j[4]])); if (nodeSet.has(source)&&nodeSet.has(target)) addEdge(edges,seen,{id:`semantic:${j[0]}:${s(r.id)}`,source,target,relationshipType:j[5],sourceKind:"semantic"}); }));
 const { data: manual, error: manualError } = await supabase.from("entity_relationships").select("id,source_type,source_id,target_type,target_id,relationship_type,description").eq("project_id", projectId).limit(EDGE_LIMIT + 1);
 if (manualError && manualError.code !== "42P01") throw new Error("Unable to load manual relationships.");
 for (const r of ((manual ?? []) as unknown as Row[])) { const source=nodeId(r.source_type as GraphEntityType,s(r.source_id)), target=nodeId(r.target_type as GraphEntityType,s(r.target_id)); if (nodeSet.has(source)&&nodeSet.has(target)) addEdge(edges,seen,{id:`manual:${s(r.id)}`,source,target,relationshipType:s(r.relationship_type),sourceKind:"manual",description:s(r.description)||undefined}); }
 const fullNodes = entityResults.reduce((a,r)=>a+(r.data?.length??0),0); const fullEdges = joinResults.reduce((a,r)=>a+(r.data?.length??0),0)+(manual?.length??0);
 return { nodes:nodes.slice(0,NODE_LIMIT), edges:edges.slice(0,EDGE_LIMIT), meta:{nodeCount:nodes.length,edgeCount:edges.length,truncated:fullNodes>NODE_LIMIT||fullEdges>EDGE_LIMIT||edges.length>EDGE_LIMIT,nodeLimit:NODE_LIMIT,edgeLimit:EDGE_LIMIT,omittedNodes:Math.max(0,fullNodes-NODE_LIMIT),omittedEdges:Math.max(0,fullEdges-EDGE_LIMIT)} };
}
export async function assertGraphEntity(supabase: Awaited<ReturnType<typeof requireUser>>["supabase"], projectId:string, type:GraphEntityType, id:string) { const { data, error } = await supabase.from(entityTableMap[type]).select("id").eq("project_id", projectId).eq("id", id).single(); if (error || !data) notFound(); }
