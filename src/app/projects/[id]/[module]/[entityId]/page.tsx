import Link from "next/link";
import { notFound } from "next/navigation";
import { CtiDelete, CtiForm } from "@/components/cti-forms";
import { requireUser } from "@/lib/auth";
import {
  ctiDetailPath,
  ctiModuleLabels,
  ctiRecordTitle,
  ctiTabs,
  entityTables,
} from "@/lib/cti-schema";

type Row = Record<string, unknown>;
const ss = (v: unknown) => String(v ?? "");
const aa = (v: unknown) =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
const relationConfig = {
  actors: [
    ["threat_actor_malware", "threat_actor_id", "malware_id", "malware"],
    [
      "threat_actor_indicators",
      "threat_actor_id",
      "indicator_id",
      "indicators",
    ],
    [
      "threat_actor_mitre_techniques",
      "threat_actor_id",
      "mitre_technique_id",
      "mitre",
    ],
  ],
  campaigns: [
    ["campaign_threat_actors", "campaign_id", "threat_actor_id", "actors"],
    ["campaign_malware", "campaign_id", "malware_id", "malware"],
    ["campaign_indicators", "campaign_id", "indicator_id", "indicators"],
    ["campaign_mitre_techniques", "campaign_id", "mitre_technique_id", "mitre"],
  ],
  indicators: [
    ["threat_actor_indicators", "indicator_id", "threat_actor_id", "actors"],
    ["campaign_indicators", "indicator_id", "campaign_id", "campaigns"],
    ["malware_indicators", "indicator_id", "malware_id", "malware"],
  ],
  malware: [
    ["threat_actor_malware", "malware_id", "threat_actor_id", "actors"],
    ["campaign_malware", "malware_id", "campaign_id", "campaigns"],
    ["malware_indicators", "malware_id", "indicator_id", "indicators"],
    ["cve_malware", "malware_id", "cve_id", "cves"],
    ["malware_mitre_techniques", "malware_id", "mitre_technique_id", "mitre"],
  ],
  cves: [["cve_malware", "cve_id", "malware_id", "malware"]],
  mitre: [
    [
      "threat_actor_mitre_techniques",
      "mitre_technique_id",
      "threat_actor_id",
      "actors",
    ],
    [
      "campaign_mitre_techniques",
      "mitre_technique_id",
      "campaign_id",
      "campaigns",
    ],
    ["malware_mitre_techniques", "mitre_technique_id", "malware_id", "malware"],
  ],
} as const;
const optionKeys = {
  actors: "threat_actor_ids",
  campaigns: "campaign_ids",
  indicators: "indicator_ids",
  malware: "malware_ids",
  cves: "cve_ids",
  mitre: "mitre_technique_ids",
} as const;
export default async function Detail({
  params,
}: {
  params: Promise<{ id: string; module: string; entityId: string }>;
}) {
  const { id, module, entityId } = await params;
  if (!ctiTabs.includes(module as never)) notFound();
  const tab = module as keyof typeof entityTables;
  const { supabase } = await requireUser();
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id,name")
    .eq("id", id)
    .single();
  if (projectError || !project) notFound();
  const { data: row, error } = await supabase
    .from(entityTables[tab])
    .select("*")
    .eq("project_id", id)
    .eq("id", entityId)
    .single();
  if (error || !row) notFound();
  const [actors, campaigns, indicators, malware, cves, mitre] =
    await Promise.all([
      supabase.from("threat_actors").select("*").eq("project_id", id),
      supabase.from("campaigns").select("*").eq("project_id", id),
      supabase.from("indicators").select("*").eq("project_id", id),
      supabase.from("malware").select("*").eq("project_id", id),
      supabase.from("cves").select("*").eq("project_id", id),
      supabase.from("mitre_techniques").select("*").eq("project_id", id),
    ]);
  const optionRows = {
    actors: actors.data ?? [],
    campaigns: campaigns.data ?? [],
    indicators: indicators.data ?? [],
    malware: malware.data ?? [],
    cves: cves.data ?? [],
    mitre: mitre.data ?? [],
  };
  const options = {
    threat_actor_ids: optionRows.actors as Row[],
    campaign_ids: optionRows.campaigns as Row[],
    indicator_ids: optionRows.indicators as Row[],
    malware_ids: optionRows.malware as Row[],
    cve_ids: optionRows.cves as Row[],
    mitre_technique_ids: optionRows.mitre as Row[],
  };
  const relRows = await Promise.all(
    relationConfig[tab].map(([join]) =>
      supabase
        .from(join)
        .select("*")
        .eq("project_id", id)
        .eq(relationConfig[tab].find((c) => c[0] === join)![1], entityId),
    ),
  );
  if (relRows.some((r) => r.error))
    throw new Error("Unable to load CTI relationships.");
  const selected: Record<string, string[]> = {};
  const related = relationConfig[tab].map((cfg, i) => {
    const [, , other, target] = cfg;
    const ids = (relRows[i].data ?? []).map((r) => ss((r as Row)[other]));
    selected[optionKeys[target]] = ids;
    return {
      target,
      items: (optionRows[target] as Row[]).filter((r) =>
        ids.includes(ss(r.id)),
      ),
    };
  });
  return (
    <section className="mx-auto max-w-5xl space-y-6">
      <Link
        className="text-sm text-cyan-200"
        href={`/projects/${id}?tab=${tab}`}
      >
        ← Back to {ctiModuleLabels[tab]}
      </Link>
      <article className="card">
        <p className="text-sm text-slate-400">{ctiModuleLabels[tab]}</p>
        <h1 className="text-3xl font-bold text-white">
          {ctiRecordTitle(row as Row)}
        </h1>
        <dl className="mt-4 grid gap-3 md:grid-cols-2">
          {Object.entries(row as Row)
            .filter(([k]) => !["id", "project_id"].includes(k))
            .map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs uppercase text-slate-500">
                  {k.replaceAll("_", " ")}
                </dt>
                <dd className="whitespace-pre-wrap text-sm text-slate-200">
                  {Array.isArray(v)
                    ? aa(v).join(", ")
                    : typeof v === "object" && v
                      ? JSON.stringify(v, null, 2)
                      : ss(v)}
                </dd>
              </div>
            ))}
        </dl>
      </article>
      <section className="card">
        <h2 className="font-semibold text-white">Related entities</h2>
        {related.map((group) => (
          <div key={group.target} className="mt-3">
            <h3 className="text-sm font-semibold text-cyan-200">
              {ctiModuleLabels[group.target]}
            </h3>
            {group.items.length ? (
              <ul className="list-disc pl-5 text-sm">
                {group.items.map((item) => (
                  <li key={ss(item.id)}>
                    <Link
                      className="text-slate-200 hover:text-cyan-200"
                      href={ctiDetailPath(id, group.target, ss(item.id))}
                    >
                      {ctiRecordTitle(item)}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">No linked records.</p>
            )}
          </div>
        ))}
      </section>
      <section className="card">
        <CtiForm
          tab={tab}
          projectId={id}
          row={row as Row}
          options={options}
          selected={selected}
        />
        <CtiDelete tab={tab} projectId={id} row={row as Row} />
      </section>
    </section>
  );
}
