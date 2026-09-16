import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { globalRangeSchema } from "@/lib/baykush-node/range";
import { getNodeChanges } from "@/lib/baykush-node/queries";

export default async function Page({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  await requireUser();
  const range = globalRangeSchema.catch("24h").parse((await searchParams).range);
  const feed = await getNodeChanges(range).catch(() => null);
  if (!feed) return <div role="status" className="card text-amber-200">DEGRADED · change activity UNKNOWN. The Node feed is unavailable; this is not zero activity.</div>;
  return <section className="space-y-4">
    <header className="citem-page-header"><div><p className="citem-eyebrow">BAYKUSH Intelligence Node</p><h1 className="citem-title">Factual changes</h1><p className="citem-subtitle">Source and measurement facts only; no inferred campaign, attacker, victim, or threat level.</p></div><Link href={`/techint/global?range=${range}`} className="citem-button-ghost">Back</Link></header>
    {feed.data.map((item, index) => <article className="card" key={item.fact_revision_id ?? index}><p className="text-sm text-stone-200">{item.measurement_key ?? item.measurementKey ?? "Source change"}</p><p className="mt-1 text-xs text-stone-500">{item.event_time ?? item.event_date ?? "Time unavailable"} · {item.entity_key ?? "No entity"}</p></article>)}
  </section>;
}
