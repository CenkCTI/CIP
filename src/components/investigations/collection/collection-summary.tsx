import Link from "next/link";
import type { CollectionMetrics } from "@/lib/analysis/annotation-credibility/collection-metrics";

export function CollectionSummary({ projectId, metrics }: { projectId: string; metrics: CollectionMetrics }) {
  const root = `/projects/${projectId}`;
  const inventory = root + "/fusion?view=inventory";
  const annotations = inventory + "&type=ANNOTATION";
  const groups = [
    { heading: "Collection overview", note: "Open questions and gaps include partially addressed records. Total requirements includes stopped requirements.",
      items: [
        ["Open intelligence questions", "questions", "#collection-questions"], ["Open information gaps", "gaps", "#collection-information-gaps"],
        ["Total collection requirements", "requirements", "#collection-planning"], ["Open requirements", "open", "#collection-planning"],
        ["Collecting requirements", "collecting", "#collection-planning"], ["Satisfied requirements", "satisfied", "#collection-planning"],
        ["Active collected sources", "sources", root + "/sources"], ["Archived sources", "archived", root + "/sources"],
      ] },
    { heading: "Information quality and validation queue", note: "Source and assertion metrics cover active sources. Annotation metrics cover assessable passages on ready assets from active sources.",
      items: [
        ["Sources not evaluated", "sourcePending", root + "/sources"], ["Stale source reviews", "sourceStale", root + "/sources"],
        ["Annotations not evaluated", "annotationPending", annotations + "&credibility=unevaluated"],
        ["Current annotation reviews", "annotationCurrent", annotations],
        ["Stale annotation reviews", "annotationStale", annotations + "&credibility=stale"],
        ["Assertions not evaluated", "assertionPending", root + "/source-claims"],
        ["Stale assertion reviews", "assertionStale", root + "/source-claims"],
        ["Recorded lineage pairs", "lineage", root + "/source-claims"],
      ] },
    { heading: "Analysis handoff", note: "Annotation, claim, IOC and evidence counts include all retained project records. Review open gaps and collection requirements above alongside the available material. The analyst assesses relevance and sufficiency.",
      items: [
        ["Source annotations", "annotations", annotations], ["Source Claims", "claims", root + "/source-claims"],
        ["Indicators", "indicators", root + "?tab=indicators"], ["Evidence records", "evidence", root + "?tab=evidence&view=evidence"],
      ] },
  ] satisfies { heading: string; note: string; items: [string, keyof CollectionMetrics, string][] }[];

  return (
    <div className="grid gap-3 xl:grid-cols-2">
      {groups.map(({ heading, note, items }) => (
        <section className="card space-y-3" key={heading}>
          <h2 className="text-sm font-semibold text-amber-200">{heading}</h2>
          <p className="text-xs text-stone-400">{note}</p>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {items.map(([label, key, href]) => (
              <div className="rounded border border-stone-800 p-2" key={key}>
                <dt className="text-xs text-stone-300"><Link className="underline-offset-2 hover:underline" href={href}>{label}</Link></dt>
                <dd className="mt-1 text-sm font-semibold text-stone-100">{metrics[key]?.toLocaleString() ?? "Unavailable"}</dd>
              </div>
            ))}
          </dl>
          {heading === "Analysis handoff" && <div className="flex flex-wrap gap-2">
            <Link className="citem-button-ghost" href={inventory}>Fusion Inventory</Link>
            <Link className="citem-button-ghost" href={root + "/canvas"}>Analysis Canvas</Link>
            <Link className="citem-button-ghost" href={root + "/reports"}>Intelligence Products</Link>
          </div>}
        </section>
      ))}
    </div>
  );
}
