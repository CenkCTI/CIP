import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getNodeEntity } from "@/lib/baykush-node/queries";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const result = await getNodeEntity(id).catch(() => null);
  if (!result) return <div className="card">Node entity is unavailable.</div>;
  return <section className="space-y-4"><header className="citem-page-header"><div><p className="citem-eyebrow">Node global entity · not a private CİTEM entity</p><h1 className="citem-title">{result.data.entity.canonicalKey}</h1><p className="citem-subtitle">{result.data.entity.kind}</p></div><Link className="citem-button-ghost" href="/techint/global">Back</Link></header>{result.data.observations.map((observation, index) => <article className="card" key={index}>{observation.sourceKey}</article>)}</section>;
}
