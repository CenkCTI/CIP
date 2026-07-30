import Link from "next/link";
import { notFound } from "next/navigation";
import { ReportDeleteForm } from "@/components/reports/report-delete";
import { ReportEditor } from "@/components/reports/report-editor";
import { requireUser } from "@/lib/auth";
import { parseJsonDoc } from "@/lib/reports/schema";
import { reportInsertSources } from "@/lib/reports/insert-sources";
import { ProductLifecycle } from "@/components/reports/product-lifecycle";
import { AnalyticalReferences } from "@/components/reports/analytical-references";

type Row = Record<string, unknown>;

export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string; reportId: string }>;
}) {
  const { id, reportId } = await params;
  const { supabase, user } = await requireUser();
  const { data: project } = await supabase
    .from("projects")
    .select("id,name,owner_id")
    .eq("id", id)
    .single();
  if (!project || project.owner_id !== user.id) notFound();
  const { data: report, error } = await supabase
    .from("reports")
    .select("*")
    .eq("project_id", id)
    .eq("id", reportId)
    .single();
  if (error || !report) notFound();
  const parsed = parseJsonDoc(report.content);
  if (!parsed.success)
    return (
      <section className="mx-auto max-w-6xl">
        <Link
          href={`/projects/${id}?tab=reports`}
          className="text-sm text-cyan-300"
        >
          ← Reports
        </Link>
        <div className="card mt-4 text-red-300" role="alert">
          This report contains invalid structured content and cannot be opened
          until the stored document is repaired.
        </div>
      </section>
    );
  const results = await Promise.all(
    reportInsertSources.map(([t, select]) =>
      supabase
        .from(t)
        .select(select)
        .eq("project_id", id)
        .order("id", { ascending: true })
        .limit(100),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed)
    return (
      <section className="mx-auto max-w-6xl">
        <Link
          href={`/projects/${id}?tab=reports`}
          className="text-sm text-cyan-300"
        >
          ← Reports
        </Link>
        <div className="card mt-4 text-red-300" role="alert">
          Unable to load safe project insertion metadata. Refresh and try again.
        </div>
      </section>
    );
  const insertables = Object.fromEntries(
    reportInsertSources.map(([t], i) => [
      t,
      (results[i].data ?? []) as unknown as Row[],
    ]),
  );
  const { data: versions, error: versionsError } = await supabase.from("report_versions").select("*,report_version_references(count)").eq("project_id", id).eq("report_id", reportId).order("version_number", { ascending: false });
  if (versionsError) notFound();
  const authoritativeVersion=(versions??[]).find(v=>v.id===report.authoritative_version_id)??null;
  const baselineVersion=authoritativeVersion??(versions??[])[0]??null;
  const [{data:draftReferences,error:draftReferenceError},{data:versionReferences,error:versionReferenceError}]=await Promise.all([
    supabase.from("report_references").select("*").eq("project_id",id).eq("report_id",reportId).order("created_at"),
    baselineVersion?supabase.from("report_version_references").select("*").eq("project_id",id).eq("report_version_id",baselineVersion.id):Promise.resolve({data:[],error:null}),
  ]);
  if(draftReferenceError||versionReferenceError) notFound();
  const referenceSources=[
    ["SOURCE","sources","id,title,source_type,reliability,verification_state,archived_at,updated_at","title"],
    ["EVIDENCE","evidence","id,title,type,updated_at","title"],
    ["INDICATOR","indicators","id,value,type,confidence,updated_at","value"],
    ["ENRICHMENT_RESULT","enrichment_results","id,category,confidence,created_at","category"],
    ["INFRASTRUCTURE_CLUSTER","infrastructure_clusters","id,name,status,confidence,archived_at,updated_at","name"],
    ["TIMELINE_EVENT","timeline_events","id,event_name,assessment_status,confidence,updated_at","event_name"],
    ["CAMPAIGN","campaigns","id,name,updated_at","name"], ["THREAT_ACTOR","threat_actors","id,name,updated_at","name"], ["MALWARE","malware","id,name,family,updated_at","name"],
    ["CVE","cves","id,cve_id,severity,exploit_status,updated_at","cve_id"], ["MITRE_TECHNIQUE","mitre_techniques","id,technique_id,technique_name,tactic,updated_at","technique_id"],
    ["ATTRIBUTION_HYPOTHESIS","attribution_hypotheses","id,title,status,confidence,archived_at,updated_at","title"], ["ATTRIBUTION_ASSESSMENT","campaign_attribution_assessments","id,assessment_status,conclusion_type,confidence,updated_at","assessment_status"],
  ] as const;
  const candidateResults=await Promise.all(referenceSources.map(([,table])=>supabase.from(table).select("*").eq("project_id",id).limit(200)));
  if(candidateResults.some(x=>x.error)) notFound();
  const candidates=Object.fromEntries(referenceSources.map(([type,,,label],i)=>[type,((candidateResults[i].data??[]) as unknown as Row[]).map(x=>({...x,label:type==="MITRE_TECHNIQUE"?`${String((x as Row).technique_id)} — ${String((x as Row).technique_name)}`:type==="ENRICHMENT_RESULT"?`Enrichment ${String((x as Row).category)}`:type==="ATTRIBUTION_ASSESSMENT"?`Attribution assessment · ${String((x as Row).assessment_status)}`:String((x as Row)[label])}))]));
  const { count: relationshipCount, error: relationshipCountError } =
    await supabase
      .from("entity_relationships")
      .select("id", { count: "exact", head: true })
      .eq("project_id", id)
      .or(
        `and(source_type.eq.REPORT,source_id.eq.${reportId}),and(target_type.eq.REPORT,target_id.eq.${reportId})`,
      );
  if (relationshipCountError)
    return (
      <section className="mx-auto max-w-6xl">
        <Link
          href={`/projects/${id}?tab=reports`}
          className="text-sm text-cyan-300"
        >
          ← Reports
        </Link>
        <div className="card mt-4 text-red-300" role="alert">
          Unable to load Report relationship impact. Refresh and try again.
        </div>
      </section>
    );
  return (
    <section className="mx-auto max-w-6xl">
      <h1 className="mt-3 text-3xl font-bold text-white">Edit report</h1>
      <ReportEditor
        projectId={id}
        report={{ ...(report as Row), content: parsed.data }}
        insertables={insertables}
      />
      <div className="mt-6"><AnalyticalReferences projectId={id} reportId={reportId} references={(draftReferences??[]) as Row[]} snapshots={(versionReferences??[]) as Row[]} candidates={candidates as Record<string,Row[]>}/></div>
      <ProductLifecycle projectId={id} report={report as Row} versions={(versions ?? []) as Row[]} authoritativeVersion={authoritativeVersion as Row|null} />
      {versions?.length?<div className="card mt-6 border-amber-900/60"><h2 className="font-semibold text-amber-200">Historical record preserved</h2><p className="mt-2 text-sm text-slate-400">This Report has permanent versions and cannot be deleted. Archive it instead.</p></div>:<div className="card mt-6 border-red-900/60">
        <h2 className="font-semibold text-red-200">Delete report</h2>
        <p className="mt-2 text-sm text-slate-400">
          Type the current report title to confirm: {String(report.title)}
        </p>
        <ReportDeleteForm
          projectId={id}
          reportId={reportId}
          title={String(report.title)}
          relationshipCount={relationshipCount ?? 0}
        />
      </div>}
    </section>
  );
}
