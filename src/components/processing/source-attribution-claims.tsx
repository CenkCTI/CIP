import Link from "next/link";

type Row = Record<string, unknown>;
const text = (value: unknown) => String(value ?? "");

export function SourceAttributionClaims({
  projectId,
  items,
}: {
  projectId: string;
  items: Row[];
}) {
  if (!items.length) return null;

  return (
    <section className="rounded-lg border border-amber-900/25 bg-[#0f1417] p-4">
      <div>
        <p className="citem-label">Source-reported attribution</p>
        <h2 className="mt-1 text-lg font-semibold text-stone-100">
          Attribution claims in reporting
        </h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-stone-500">
          These are statements made by collected sources and mapped to this actor
          identity. They are evidence inputs, not CITEM attribution conclusions or
          preferred hypotheses.
        </p>
      </div>

      <div className="mt-4 grid gap-3">
        {items.map((item) => {
          const annotation = (item.annotation ?? {}) as Row;
          const source = (item.source ?? {}) as Row;
          const asset = (item.asset ?? {}) as Row;
          const sourceId = text(annotation.source_id);
          const annotationId = text(annotation.id);
          return (
            <article
              key={text(item.id)}
              className="rounded border border-stone-800 bg-black/15 p-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-stone-200">
                    {text(source.title) || "Source"}
                  </p>
                  <p className="mt-1 text-xs text-stone-600">
                    {text(source.publisher) || "Publisher not recorded"}
                    {annotation.page_number
                      ? ` · p. ${text(annotation.page_number)}`
                      : ""}
                  </p>
                </div>
                <span className="citem-badge" data-tone="attention">
                  {text(item.mapping_origin)}
                </span>
              </div>

              <p className="mt-3 text-sm leading-6 text-stone-300">
                {text(item.claim_summary)}
              </p>
              <p className="mt-2 font-mono text-xs text-stone-600">
                Claimed actor wording: {text(item.claimed_actor_text)}
              </p>

              {annotation.selected_text ? (
                <blockquote className="mt-3 border-l-2 border-amber-800/60 pl-3 text-xs leading-5 text-stone-500">
                  {text(annotation.selected_text)}
                </blockquote>
              ) : null}

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-stone-800/70 pt-3">
                <span className="min-w-0 truncate font-mono text-[10px] text-stone-700">
                  {text(asset.original_filename)}
                  {asset.sha256 ? ` · SHA-256 ${text(asset.sha256).slice(0, 18)}…` : ""}
                </span>
                {sourceId && annotationId ? (
                  <Link
                    className="text-xs font-medium text-amber-300 hover:text-amber-200"
                    href={`/projects/${projectId}/sources/${sourceId}?annotation=${annotationId}`}
                  >
                    Open source annotation →
                  </Link>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
