import type { ReactNode } from "react";
import Link from "next/link";

export default async function InvestigationLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <>
      <nav className="mx-auto mb-4 flex max-w-6xl flex-wrap items-center gap-2 rounded border border-stone-800/80 bg-black/10 px-3 py-2 text-xs" aria-label="Investigation research artefacts">
        <span className="citem-label mr-1">Research artefacts</span>
        <Link className="rounded px-3 py-1.5 text-stone-400 hover:bg-stone-900 hover:text-amber-300" href={`/projects/${id}?tab=evidence&view=evidence`}>
          Evidence
        </Link>
        <Link className="rounded px-3 py-1.5 text-stone-400 hover:bg-stone-900 hover:text-amber-300" href={`/projects/${id}/sources`}>
          Sources
        </Link>
      </nav>
      {children}
    </>
  );
}
