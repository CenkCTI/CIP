import Link from "next/link";
const items=[['/techint','Global View'],['/techint/profiles','Profiles'],['/techint/investint','InvestINT']] as const;
export function TechIntNav(){return <nav className="mb-5 flex flex-wrap gap-2" aria-label="TechINT workspace views">{items.map(([href,label])=><Link key={href} href={href} className="rounded border border-stone-800 px-3 py-2 text-sm text-stone-300 hover:border-amber-500 hover:text-amber-300">{label}</Link>)}</nav>}
export function EmptyTechInt({title,body}:{title:string;body:string}){return <div className="citem-empty panel-corners"><div><p className="citem-eyebrow">Phase 2.3A foundation</p><h2 className="citem-section-title mt-3">{title}</h2><p className="mt-2 max-w-2xl text-sm text-stone-500">{body}</p></div></div>}
