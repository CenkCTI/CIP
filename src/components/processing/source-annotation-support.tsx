import Link from "next/link";

type Row = Record<string, unknown>;
const text = (value: unknown) => String(value ?? "");

function shortHash(value: unknown) {
  const hash = text(value);
  if (!hash) return "";
  return hash.length > 22 ? `${hash.slice(0, 12)}…${hash.slice(-8)}` : hash;
}

export function SourceAnnotationSupport({
  projectId,
  items,
}: {
  projectId: string;
  items: Row[];
}) {
  if (!items.length) {
    return (
      <section className="rounded-lg border border-stone-800/70 bg-[#0f1417] p-4">
        <p className="citem-label">Source support</p>
        <h2 className="mt-1 text-lg font-semibold text-stone-100">
          Annotation provenance
        </h2>
        <p className="mt-2 text-sm leading-6 text-stone-600">
          No Stage 3 source annotation has been linked to this record yet.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-stone-800/80 bg-[#0f1417] p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="citem-label">Source support</p>
          <h2 className="mt-1 text-lg font-semibold text-stone-100">
            Annotation provenance
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-stone-500">
            These links show where this structured record came from. They preserve
            source wording and normalization decisions; they do not evaluate source
            reliability or information credibility.
          </p>
        </div>
        <span className="font-mono text-xs text-stone-600">
          {items.length} annotation{items.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="mt-4 grid gap-3">
        {items.map((item) => {
          const annotation = (item.annotation ?? {}) as Row;
          const source = (item.source ?? {}) as Row;
          const asset = (item.asset ?? {}) as Row;
          const quote =
            text(annotation.selected_text) ||
            text(item.raw_value) ||
            text(annotation.comment) ||
            "Region annotation; no extracted text.";
          const sourceId = text(annotation.source_id);
          const annotationId = text(annotation.id);
          return (
            <article
              className="rounded border border-stone-800 bg-black/15 p-3"
              key={text(item.id)}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
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
                <div className="flex flex-wrap gap-1.5">
                  <span className="citem-badge">{text(item.output_action)}</span>
                  <span className="citem-badge" data-tone="attention">
                    {text(item.mapping_origin)}
                  </span>
                </div>
              </div>

              <blockquote className="mt-3 border-l-2 border-amber-800/60 pl-3 text-xs leading-5 text-stone-500">
                {quote}
              </blockquote>

              {item.normalized_value &&
              text(item.normalized_value) !== text(item.raw_value) ? (
                <div className="mt-3 rounded border border-stone-800/70 bg-black/10 px-3 py-2">
                  <p className="citem-label">Normalized value</p>
                  <p className="mt-1 break-all font-mono text-xs text-stone-400">
                    {text(item.normalized_value)}
                  </p>
                </div>
              ) : null}

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-stone-800/70 pt-3">
                <div className="min-w-0 text-[11px] text-stone-700">
                  {asset.original_filename ? (
                    <span>{text(asset.original_filename)}</span>
                  ) : null}
                  {asset.sha256 ? (
                    <span className="ml-2 font-mono">
                      SHA-256 {shortHash(asset.sha256)}
                    </span>
                  ) : null}
                </div>
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
