"use client";

import { useEffect, useState, useTransition } from "react";

import { recordSourcePrintExport } from "@/app/projects/[id]/source-collection-actions";
import { CitemLogo } from "@/components/citem-logo";

type Row = Record<string, unknown>;
const s = (value: unknown) => String(value ?? "");

function date(value: unknown) {
  if (!value) return "Belirtilmedi";
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? "Belirtilmedi" : parsed.toLocaleString();
}

function TextDocument({ url }: { url: string }) {
  const [text, setText] = useState("Metin yükleniyor…");
  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error();
        return response.text();
      })
      .then((value) => {
        if (!cancelled) setText(value);
      })
      .catch(() => {
        if (!cancelled) setText("Metin preview yüklenemedi.");
      });
    return () => {
      cancelled = true;
    };
  }, [url]);
  return <pre className="packet-text">{text}</pre>;
}

export function SourcePrintPacket({
  projectId,
  project,
  source,
  asset,
  signedUrl,
  gaps,
  requirements,
  notes,
  annotations,
  annotationGapLinks,
  annotationRequirementLinks,
}: {
  projectId: string;
  project: Row;
  source: Row;
  asset: Row | null;
  signedUrl: string | null;
  gaps: Row[];
  requirements: Row[];
  notes: Row[];
  annotations: Row[];
  annotationGapLinks: Row[];
  annotationRequirementLinks: Row[];
}) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  const gapById = new Map(gaps.map((gap) => [s(gap.id), gap]));
  const requirementById = new Map(
    requirements.map((requirement) => [s(requirement.id), requirement]),
  );
  const gapIdsByAnnotation = new Map<string, string[]>();
  const requirementIdsByAnnotation = new Map<string, string[]>();
  for (const link of annotationGapLinks) {
    const id = s(link.annotation_id);
    gapIdsByAnnotation.set(id, [
      ...(gapIdsByAnnotation.get(id) ?? []),
      s(link.gap_id),
    ]);
  }
  for (const link of annotationRequirementLinks) {
    const id = s(link.annotation_id);
    requirementIdsByAnnotation.set(id, [
      ...(requirementIdsByAnnotation.get(id) ?? []),
      s(link.requirement_id),
    ]);
  }

  const mime = s(asset?.mime_type).toLowerCase();
  const fileName = s(asset?.original_filename).toLowerCase();
  const isPdf = mime === "application/pdf" || fileName.endsWith(".pdf");
  const isImage =
    mime.startsWith("image/png") ||
    mime.startsWith("image/jpeg") ||
    /.(png|jpe?g)$/.test(fileName);
  const isText =
    mime.startsWith("text/") ||
    mime === "application/json" ||
    /.(txt|md|csv|json|log)$/.test(fileName);

  function printPacket() {
    start(async () => {
      const result = await recordSourcePrintExport(
        projectId,
        s(source.id),
        asset ? s(asset.id) : null,
      );
      if (result.error) {
        setMessage(result.error);
        return;
      }
      setMessage("");
      window.print();
    });
  }

  return (
    <main className="packet-shell">
      <div className="no-print packet-toolbar">
        <button className="citem-button" type="button" disabled={pending} onClick={printPacket}>
          {pending ? "Hazırlanıyor…" : "Yazdır / PDF olarak kaydet"}
        </button>
        <span className="packet-toolbar-note">
          Bu çalışma kopyası analist notlarını ve annotation indeksini içerir; orijinal
          kaynak ayrı ve değişmeden tutulur.
        </span>
        {message ? <span className="packet-error">{message}</span> : null}
      </div>

      <section className="packet-page packet-cover">
        <div className="packet-brand">
          <div>
            <p className="packet-baykush">BAYKUSH</p>
            <CitemLogo variant="horizontal" priority />
          </div>
          <p className="packet-kicker">SOURCE COLLECTION COPY</p>
        </div>

        <div className="packet-title-block">
          <p className="packet-label">Investigation</p>
          <h1>{s(project.name)}</h1>
          <p className="packet-question">{s(project.research_question)}</p>
        </div>

        <div className="packet-section">
          <p className="packet-label">Source</p>
          <h2>{s(source.title)}</h2>
          <dl className="packet-grid">
            <div><dt>Publisher</dt><dd>{s(source.publisher) || "Belirtilmedi"}</dd></div>
            <div><dt>Source type</dt><dd>{s(source.source_type)}</dd></div>
            <div><dt>Published</dt><dd>{date(source.published_at)}</dd></div>
            <div><dt>Collected</dt><dd>{date(source.accessed_at)}</dd></div>
          </dl>
        </div>

        <div className="packet-section">
          <p className="packet-label">Collection Context</p>
          <p className="packet-rationale">
            {s(source.collection_rationale) || "Collection rationale kaydedilmemiş."}
          </p>
          {gaps.length ? (
            <div className="packet-context-block">
              <strong>Information Gaps</strong>
              {gaps.map((gap) => <p key={s(gap.id)}>• {s(gap.description)}</p>)}
            </div>
          ) : null}
          {requirements.length ? (
            <div className="packet-context-block">
              <strong>Collection Requirements</strong>
              {requirements.map((requirement) => (
                <p key={s(requirement.id)}>• {s(requirement.requirement)}</p>
              ))}
            </div>
          ) : null}
        </div>

        <div className="packet-section packet-provenance">
          <p className="packet-label">Source Provenance</p>
          <dl>
            <div><dt>Source ID</dt><dd>{s(source.id)}</dd></div>
            <div><dt>Asset ID</dt><dd>{asset ? s(asset.id) : "URL-only source"}</dd></div>
            <div><dt>Original filename</dt><dd>{asset ? s(asset.original_filename) : "—"}</dd></div>
            <div><dt>SHA-256</dt><dd>{asset ? s(asset.sha256) || "—" : "—"}</dd></div>
            <div><dt>Original URL</dt><dd>{s(source.url) || "—"}</dd></div>
          </dl>
        </div>

        <p className="packet-disclaimer">
          Bu kopyadaki analist notları ve işaretlemeler CİTEM içerisinde eklenmiştir
          ve orijinal kaynağın parçası değildir. Orijinal kaynak değiştirilmeden
          ayrıca muhafaza edilmektedir.
        </p>
      </section>

      {notes.length || annotations.length ? (
        <section className="packet-page">
          <header className="packet-page-header">
            <span>BAYKUSH / CİTEM</span>
            <span>Analyst Working Material</span>
          </header>
          <h2>Analist Çalışma Notları</h2>

          {notes.length ? (
            <div className="packet-notes">
              {notes.map((note, index) => (
                <article key={s(note.id)}>
                  <p className="packet-label">Not {String(index + 1).padStart(2, "0")}</p>
                  <p>{s(note.body)}</p>
                </article>
              ))}
            </div>
          ) : (
            <p className="packet-muted">Source düzeyinde analyst note yok.</p>
          )}

          {annotations.length ? (
            <>
              <h2 className="packet-subhead">Annotation Index</h2>
              <div className="packet-notes">
                {annotations.map((annotation, index) => {
                  const id = s(annotation.id);
                  const linkedGaps = gapIdsByAnnotation.get(id) ?? [];
                  const linkedRequirements = requirementIdsByAnnotation.get(id) ?? [];
                  return (
                    <article key={id}>
                      <p className="packet-label">
                        {String(index + 1).padStart(2, "0")} · {s(annotation.annotation_type)}
                        {annotation.page_number ? ` · p. ${s(annotation.page_number)}` : ""}
                      </p>
                      {annotation.selected_text ? (
                        <blockquote>{s(annotation.selected_text)}</blockquote>
                      ) : null}
                      {annotation.comment ? <p>{s(annotation.comment)}</p> : null}
                      {linkedGaps.map((gapId) => (
                        <p className="packet-link" key={gapId}>
                          Gap: {s(gapById.get(gapId)?.description)}
                        </p>
                      ))}
                      {linkedRequirements.map((requirementId) => (
                        <p className="packet-link" key={requirementId}>
                          Requirement: {s(requirementById.get(requirementId)?.requirement)}
                        </p>
                      ))}
                    </article>
                  );
                })}
              </div>
            </>
          ) : null}
        </section>
      ) : null}

      <section className="packet-document-section">
        <header className="packet-document-header">
          <span>BAYKUSH / CİTEM</span>
          <strong>ORIGINAL SOURCE</strong>
          <span>{s(source.title)}</span>
        </header>

        {!signedUrl && source.url ? (
          <div className="packet-external-source">
            <p>Bu kayıt URL-only bir Source'tur. Orijinal materyal:</p>
            <a href={s(source.url)}>{s(source.url)}</a>
          </div>
        ) : null}

        {signedUrl && isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="packet-image" src={signedUrl} alt="" />
        ) : null}

        {signedUrl && isText ? <TextDocument url={signedUrl} /> : null}

        {signedUrl && isPdf ? (
          <div className="packet-pdf">
            <p className="packet-pdf-note">
              PDF orijinali aşağıda browser PDF viewer içinde açılır. Annotation'ların
              sayfa/type/comment dökümü önceki Annotation Index bölümündedir.
            </p>
            <object data={signedUrl} type="application/pdf" className="packet-pdf-object">
              <a href={signedUrl}>Orijinal PDF'yi aç</a>
            </object>
          </div>
        ) : null}

        {signedUrl && !isPdf && !isImage && !isText ? (
          <div className="packet-external-source">
            <p>Bu dosya inline preview için güvenli listede değildir.</p>
            <a href={signedUrl}>Orijinal dosyayı aç / indir</a>
          </div>
        ) : null}
      </section>

      <style>{`
        .packet-shell{background:#111;color:#e7e5e4;min-height:100vh;padding:24px;font-family:Arial,sans-serif}
        .packet-toolbar{max-width:960px;margin:0 auto 20px;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
        .packet-toolbar-note{font-size:12px;color:#78716c}.packet-error{font-size:12px;color:#fca5a5}
        .packet-page{max-width:960px;min-height:1120px;margin:0 auto 28px;background:#171717;border:1px solid #44403c;padding:54px;box-sizing:border-box;break-after:page}
        .packet-cover{display:flex;flex-direction:column}.packet-brand{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #d97706;padding-bottom:24px}
        .packet-baykush{letter-spacing:.34em;font-weight:700;color:#f59e0b;margin:0 0 8px}.packet-kicker,.packet-label{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#a8a29e}
        .packet-title-block{margin-top:72px}.packet-title-block h1{font-size:36px;margin:10px 0}.packet-question{color:#d6d3d1;max-width:760px;line-height:1.6}
        .packet-section{margin-top:48px}.packet-section h2{font-size:24px;margin:8px 0 20px}.packet-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
        .packet-grid div,.packet-provenance dl div{border-top:1px solid #44403c;padding-top:9px}.packet-grid dt,.packet-provenance dt{font-size:11px;color:#78716c}.packet-grid dd,.packet-provenance dd{margin:5px 0 0;overflow-wrap:anywhere}
        .packet-rationale{font-size:16px;line-height:1.6}.packet-context-block{margin-top:18px;padding:16px;border:1px solid #44403c;background:#0c0a09}.packet-context-block p{color:#d6d3d1;font-size:13px}
        .packet-provenance dl{display:grid;gap:10px}.packet-disclaimer{margin-top:auto;border-top:1px solid #44403c;padding-top:18px;color:#78716c;font-size:11px;line-height:1.6}
        .packet-page-header,.packet-document-header{display:flex;justify-content:space-between;border-bottom:1px solid #57534e;padding-bottom:12px;margin-bottom:42px;font-size:10px;letter-spacing:.12em;color:#a8a29e}
        .packet-page h2{font-size:28px}.packet-notes{display:grid;gap:18px}.packet-notes article{border:1px solid #44403c;padding:18px;background:#0c0a09}.packet-notes p{white-space:pre-wrap;line-height:1.6}.packet-notes blockquote{border-left:3px solid #f59e0b;padding-left:12px;color:#d6d3d1}
        .packet-subhead{margin-top:44px}.packet-link{font-size:11px;color:#a8a29e}.packet-muted{color:#78716c}
        .packet-document-section{max-width:1200px;margin:0 auto 28px;background:#171717;border:1px solid #44403c;padding:28px;box-sizing:border-box}
        .packet-image{display:block;max-width:100%;height:auto;margin:auto}.packet-text{white-space:pre-wrap;overflow-wrap:anywhere;font-family:monospace;font-size:12px;line-height:1.5;background:#fff;color:#111;padding:24px}
        .packet-pdf-object{width:100%;height:85vh;min-height:900px;background:#fff}.packet-pdf-note{font-size:12px;color:#a8a29e}
        .packet-external-source{min-height:500px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}.packet-external-source a{color:#f59e0b;overflow-wrap:anywhere}
        @media print{
          @page{size:A4;margin:0}
          body{background:white!important}
          .no-print{display:none!important}
          .packet-shell{background:white;color:#111;padding:0}
          .packet-page{width:210mm;max-width:none;min-height:297mm;margin:0;border:0;background:white;color:#111;padding:18mm}
          .packet-document-section{width:210mm;max-width:none;margin:0;border:0;background:white;color:#111;padding:12mm;break-before:page}
          .packet-context-block,.packet-notes article{background:white;border-color:#aaa}
          .packet-question,.packet-context-block p,.packet-notes blockquote{color:#333}
          .packet-disclaimer,.packet-label,.packet-kicker,.packet-grid dt,.packet-provenance dt,.packet-page-header,.packet-document-header,.packet-muted,.packet-pdf-note{color:#555}
          .packet-baykush{color:#111}
          .packet-pdf-object{height:250mm}
        }
      `}</style>
    </main>
  );
}
