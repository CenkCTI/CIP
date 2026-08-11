import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listTechnicalSources } from "@/lib/techint/collection/registry";

export default async function Page() {
  await requireUser();
  const sources = listTechnicalSources();

  return (
    <section className="space-y-5">
      <header className="citem-page-header">
        <div>
          <p className="citem-eyebrow">CİTEM / TechINT / Source Semantics</p>
          <h1 className="citem-title">Source semantics</h1>
          <p className="citem-subtitle">
            Deterministic source and observation meaning used to prevent reporting volume, scoring data, and repository activity from being misread as measured attack volume.
          </p>
        </div>
        <Link className="citem-button-ghost" href="/techint/sources">Back to Technical Sources</Link>
      </header>

      <div className="grid gap-4 xl:grid-cols-2">
        {sources.map((adapter) => {
          const semantics = adapter.metadata.semantics;
          if (!semantics) return null;
          return (
            <article className="card space-y-4" key={adapter.metadata.key}>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="citem-section-title">{adapter.metadata.displayName}</h2>
                  <span className="rounded border border-stone-700 px-2 py-1 text-xs text-stone-300">{semantics.sourceClass}</span>
                </div>
                <p className="mt-2 text-sm text-stone-500">{adapter.metadata.description}</p>
              </div>

              <dl className="grid gap-2 text-xs text-stone-400 sm:grid-cols-2">
                <div><dt>Authority</dt><dd className="text-stone-200">{semantics.authorityType}</dd></div>
                <div><dt>Default basis</dt><dd className="text-stone-200">{semantics.defaultObservationBasis}</dd></div>
                <div><dt>Semantic kind</dt><dd className="text-stone-200">{semantics.defaultSemanticKind}</dd></div>
                <div><dt>Collection mode</dt><dd className="text-stone-200">{semantics.collectionMode}</dd></div>
                <div><dt>Freshness</dt><dd className="text-stone-200">{semantics.freshnessSemantics}</dd></div>
                <div className="sm:col-span-2"><dt>Coverage semantics</dt><dd className="text-stone-200">{semantics.coverageSemantics}</dd></div>
              </dl>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded border border-stone-800 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">Represents</p>
                  <p className="mt-2 text-sm text-stone-300">{semantics.represents}</p>
                </div>
                <div className="rounded border border-stone-800 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">Does not represent</p>
                  <p className="mt-2 text-sm text-stone-300">{semantics.doesNotRepresent}</p>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
