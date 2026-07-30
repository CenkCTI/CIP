import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { parseJsonDoc } from "@/lib/reports/schema";
import { tiptapToHtml } from "@/lib/reports/render";
import { attributionDisclaimer } from "@/lib/reports/versioning";
export default async function VersionPage({params}:{params:Promise<{id:string;reportId:string;versionId:string}>}) {
 const {id,reportId,versionId}=await params; const {supabase,user}=await requireUser();
 const {data:p}=await supabase.from("projects").select("owner_id").eq("id",id).single(); if(!p||p.owner_id!==user.id)notFound();
 const {data:v}=await supabase.from("report_versions").select("*,report_version_references(*)").eq("project_id",id).eq("report_id",reportId).eq("id",versionId).single(); if(!v)notFound();
 const doc=parseJsonDoc(v.content_snapshot); if(!doc.success)notFound();
 return <main className="mx-auto max-w-5xl"><Link className="text-cyan-300" href={`/projects/${id}/reports/${reportId}`}>← Report workspace</Link><article className="card mt-4"><h1 className="text-3xl font-bold">{v.title_snapshot}</h1><p>{v.product_type_snapshot} · Version {v.version_number} · {v.version_status}</p><dl className="mt-4 grid gap-3"><dt>Executive summary</dt><dd>{v.executive_summary_snapshot}</dd><dt>Key judgments</dt><dd>{v.key_judgments_snapshot}</dd><dt>Confidence</dt><dd>{v.confidence_snapshot}</dd><dt>Intelligence gaps</dt><dd>{v.intelligence_gaps_snapshot}</dd><dt>Recommendations</dt><dd>{v.recommendations_snapshot}</dd></dl><div className="prose prose-invert mt-6" dangerouslySetInnerHTML={{__html:tiptapToHtml(doc.data)}}/><h2 className="mt-6 text-xl font-semibold">Referenced-record appendix</h2><ul>{(v.report_version_references??[]).map((r:Record<string,unknown>)=><li key={String(r.id)}>{String(r.reference_type)}: {String(r.label_snapshot)} · snapshot {String(r.source_updated_at??"timestamp unavailable")}</li>)}</ul>{v.product_type_snapshot==="ATTRIBUTION_ASSESSMENT"&&<p className="mt-4 text-sm text-amber-200">{attributionDisclaimer}</p>}<div className="mt-4 flex gap-3">{["pdf","md","html"].map(f=><a className="text-cyan-300" key={f} href={`/api/projects/${id}/reports/${reportId}/export/${f}?versionId=${v.id}`}>Export {f.toUpperCase()}</a>)}</div></article></main>;
}
