export type CtiSearchParams = {
  q?: string;
  tag?: string;
  sort?: string;
  type?: string;
  country?: string;
  motivation?: string;
  confidence?: string;
  severity?: string;
  exploit_status?: string;
  tactic?: string;
  actor?: string;
  campaign?: string;
  family?: string;
  active?: string;
  start?: string;
  end?: string;
  first?: string;
  last?: string;
};
export type CtiRow = Record<string, unknown>;
export type CtiRelations = Record<string, CtiRow[] | null | undefined>;
const ss = (v: unknown) => String(v ?? "");
const aa = (v: unknown) =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
const date = (v: unknown) => {
  const s = ss(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};
function matchQ(row: CtiRow, sp: CtiSearchParams, fields: string[]) {
  const q = sp.q?.toLowerCase();
  return (
    !q ||
    fields.some((f) => ss(row[f]).toLowerCase().includes(q)) ||
    aa(row.tags).join(" ").toLowerCase().includes(q)
  );
}
function hasRel(
  rels: CtiRelations,
  key: string,
  selfCol: string,
  selfId: string,
  otherCol: string,
  otherId?: string,
) {
  if (!otherId) return true;
  return (rels[key] ?? []).some(
    (r) => ss(r[selfCol]) === selfId && ss(r[otherCol]) === otherId,
  );
}
export function ctiRecordSort(a: CtiRow, b: CtiRow, sort?: string) {
  const title = (r: CtiRow) =>
    ss(r.name || r.value || r.cve_id || r.technique_id);
  if (sort === "created")
    return (
      ss(b.created_at).localeCompare(ss(a.created_at)) ||
      ss(a.id).localeCompare(ss(b.id))
    );
  if (sort === "id") return ss(a.id).localeCompare(ss(b.id));
  return title(a).localeCompare(title(b)) || ss(a.id).localeCompare(ss(b.id));
}
export function filterActors(rows: CtiRow[], sp: CtiSearchParams) {
  return rows
    .filter(
      (r) =>
        matchQ(r, sp, ["name", "country", "description", "known_ttps"]) &&
        (!sp.country || ss(r.country) === sp.country) &&
        (!sp.motivation || aa(r.motivations).includes(sp.motivation)),
    )
    .sort((a, b) => ctiRecordSort(a, b, sp.sort));
}
export function filterCampaigns(
  rows: CtiRow[],
  sp: CtiSearchParams,
  rels: CtiRelations,
  today = new Date(),
) {
  return rows
    .filter((r) => {
      const start = date(r.start_date);
      const end = date(r.end_date);
      return (
        matchQ(r, sp, ["name", "description"]) &&
        (!sp.active ||
          (start !== null && start <= today && (!end || end >= today))) &&
        (!sp.start || !start || start >= new Date(sp.start)) &&
        (!sp.end || !end || end <= new Date(sp.end)) &&
        hasRel(
          rels,
          "campaignThreatActors",
          "campaign_id",
          ss(r.id),
          "threat_actor_id",
          sp.actor,
        )
      );
    })
    .sort((a, b) => ctiRecordSort(a, b, sp.sort));
}
export function filterIndicators(rows: CtiRow[], sp: CtiSearchParams) {
  return rows
    .filter((r) => {
      const first = date(r.first_seen);
      const last = date(r.last_seen);
      return (
        matchQ(r, sp, ["value", "source"]) &&
        (!sp.type || ss(r.type) === sp.type) &&
        (!sp.confidence || ss(r.confidence) === sp.confidence) &&
        (!sp.tag || aa(r.tags).includes(sp.tag)) &&
        (!sp.first || !first || first >= new Date(sp.first)) &&
        (!sp.last || !last || last <= new Date(sp.last))
      );
    })
    .sort((a, b) => ctiRecordSort(a, b, sp.sort));
}
export function filterMalware(
  rows: CtiRow[],
  sp: CtiSearchParams,
  rels: CtiRelations,
) {
  return rows
    .filter(
      (r) =>
        matchQ(r, sp, ["name", "family", "behavior"]) &&
        (!sp.family || ss(r.family) === sp.family) &&
        hasRel(
          rels,
          "threatActorMalware",
          "malware_id",
          ss(r.id),
          "threat_actor_id",
          sp.actor,
        ) &&
        hasRel(
          rels,
          "campaignMalware",
          "malware_id",
          ss(r.id),
          "campaign_id",
          sp.campaign,
        ),
    )
    .sort((a, b) => ctiRecordSort(a, b, sp.sort));
}
export function filterCves(rows: CtiRow[], sp: CtiSearchParams) {
  return rows
    .filter(
      (r) =>
        matchQ(r, sp, ["cve_id", "affected_product", "description"]) &&
        (!sp.severity || ss(r.severity) === sp.severity) &&
        (!sp.exploit_status || ss(r.exploit_status) === sp.exploit_status),
    )
    .sort((a, b) => ctiRecordSort(a, b, sp.sort));
}
export function filterMitre(rows: CtiRow[], sp: CtiSearchParams) {
  return rows
    .filter(
      (r) =>
        matchQ(r, sp, ["technique_id", "technique_name", "tactic"]) &&
        (!sp.tactic || ss(r.tactic) === sp.tactic) &&
        (!sp.type || ss(r.technique_id).startsWith(sp.type)),
    )
    .sort((a, b) => ctiRecordSort(a, b, sp.sort));
}
