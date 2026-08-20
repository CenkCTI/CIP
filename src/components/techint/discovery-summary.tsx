import Link from "next/link";
import type { NodeDiscoverySummary } from "@/lib/baykush-node/discovery-schema";

const findingLabels:Record<string,string>={SOURCE_SYSTEM_OVERLAP:'Source-system overlap',MULTI_ORIGIN_CONVERGENCE:'Multi-origin convergence',CROSS_CLASS_CONVERGENCE:'Cross-class convergence',CONCURRENT_MOVEMENT:'Concurrent movement'};

export function DiscoverySummary({data,range,unavailable=false}:{data?:NodeDiscoverySummary;range:'24h'|'7d'|'30d';unavailable?:boolean}){
  return <section className="card panel-corners mt-5 space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="citem-eyebrow">NODE-7 / Discovery</p><h2 className="citem-section-title">Technical convergence & discovery</h2><p className="mt-1 max-w-3xl text-sm text-stone-500">Deterministic movement around exact canonical entities. Correlation is not causation, attribution, exploitation, or a threat score.</p></div><Link href={`/techint/discovery?range=${range}`} className="citem-button-ghost">Open discovery workbench</Link></div>
    {unavailable||!data?<p className="text-sm text-stone-500">Discovery is unavailable. Core measurements and Internet Infrastructure remain independent.</p>:<>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="New entities" value={data.newEntityCount}/>
        <Metric label="Composition expansions" value={data.compositionExpansionCount}/>
        {data.convergenceCounts.slice(0,2).map(item=><Metric key={item.findingType} label={findingLabels[item.findingType]??item.findingType} value={item.count}/>) }
      </div>
      {data.topMovers.length>0?<div><p className="citem-eyebrow">Top movers · composition only</p><div className="mt-2 grid gap-2 lg:grid-cols-2">{data.topMovers.slice(0,4).map((item,index)=><article key={`${item.entityType}:${item.entityKey}:${index}`} className="rounded border border-stone-800 px-3 py-2"><p className="text-sm font-medium text-stone-200">{item.entityKey}</p><p className="mt-1 text-xs text-stone-500">{item.entityType} · +{item.newUpstreamOriginCount} origins · +{item.newSourceClassCount} classes · +{item.newSourceDefinitionCount} source systems</p></article>)}</div></div>:<p className="text-xs text-stone-500">No positive composition expansion is currently published for this range.</p>}
    </>}
  </section>;
}
function Metric({label,value}:{label:string;value:number}){return <div className="rounded border border-stone-800 px-3 py-3"><p className="text-xs uppercase tracking-[0.14em] text-stone-500">{label}</p><p className="mt-1 text-xl font-semibold text-stone-100">{value.toLocaleString()}</p></div>}
