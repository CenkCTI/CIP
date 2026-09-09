"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { useAutosave } from "@/components/document-workspace/use-autosave";
import { reportStatuses, reportTypes } from "@/lib/reports/schema";
import { reportEditorExtensions } from "@/lib/reports/editor-extensions";

type Row = Record<string, unknown>;
type Draft = {
  title: string;
  type: (typeof reportTypes)[number];
  status: (typeof reportStatuses)[number];
  content: Record<string, unknown>;
};

const s = (v: unknown) => String(v ?? "");

export function ReportEditor({
  projectId,
  report,
  insertables,
}: {
  projectId: string;
  report: Row;
  insertables: Record<string, Row[]>;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(s(report.title));
  const [type, setType] = useState<(typeof reportTypes)[number]>(
    reportTypes.includes(s(report.type) as (typeof reportTypes)[number])
      ? (s(report.type) as (typeof reportTypes)[number])
      : "TECHNICAL",
  );
  const [status, setStatus] = useState<(typeof reportStatuses)[number]>(
    reportStatuses.includes(s(report.status) as (typeof reportStatuses)[number])
      ? (s(report.status) as (typeof reportStatuses)[number])
      : "DRAFT",
  );
  const [content, setContent] = useState<Record<string, unknown>>(
    report.content as Record<string, unknown>,
  );

  const editor = useEditor({
    immediatelyRender: false,
    extensions: reportEditorExtensions(),
    content,
    editorProps: {
      attributes: {
        class:
          "min-h-[540px] px-7 pb-24 pt-6 text-[15px] leading-7 text-slate-200 outline-none [&_h1]:mb-4 [&_h1]:mt-7 [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:text-white [&_h2]:mb-3 [&_h2]:mt-6 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:text-white [&_h3]:mb-2 [&_h3]:mt-5 [&_h3]:text-xl [&_h3]:font-semibold [&_h3]:text-slate-100 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_blockquote]:my-4 [&_blockquote]:rounded-r [&_blockquote]:border-l-2 [&_blockquote]:border-amber-600 [&_blockquote]:bg-slate-950/30 [&_blockquote]:px-4 [&_blockquote]:py-3 [&_blockquote]:text-slate-300 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-slate-950 [&_pre]:p-3 [&_table]:my-4 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-slate-700 [&_td]:p-2 [&_th]:border [&_th]:border-slate-700 [&_th]:p-2",
      },
    },
    onUpdate: ({ editor: updated }) => setContent(updated.getJSON()),
  });

  const snapshot = useMemo<Draft>(
    () => ({ title, type, status, content }),
    [title, type, status, content],
  );
  const autosave = useAutosave({
    snapshot,
    initialRevision: Number(report.draft_revision ?? 0),
    save: async (draft, baseRevision) => {
      const response = await fetch(
        `/api/projects/${projectId}/reports/${s(report.id)}/draft`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...draft, baseRevision }),
        },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        revision?: number;
        error?: string;
        code?: string;
      };
      if (!response.ok)
        throw new Error(
          payload.code === "EDIT_CONFLICT"
            ? "EDIT_CONFLICT"
            : payload.error || "Autosave failed.",
        );
      return { revision: Number(payload.revision ?? baseRevision + 1) };
    },
  });

  const dirty = autosave.status !== "saved";
  const insertBlock = (kind: string, row: Row) =>
    editor
      ?.chain()
      .focus()
      .insertContent({
        type: "blockquote",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", marks: [{ type: "bold" }], text: `${labelForKind(kind)}: ` },
              { type: "text", text: titleFor(kind, row) },
            ],
          },
          {
            type: "paragraph",
            content: [
              { type: "text", text: summaryFor(kind, row) },
            ],
          },
        ],
      })
      .run();

  return (
    <div className="mt-4 grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0 overflow-hidden rounded-lg border border-slate-800 bg-[#172016]">
        <div className="border-b border-slate-800 px-6 py-5">
          <div className="flex items-center gap-4">
            <button
              type="button"
              className="shrink-0 text-sm text-amber-300 hover:text-amber-200"
              onClick={async () => {
                if (await autosave.flush()) router.push(`/projects/${projectId}/reports`);
              }}
            >
              ← Reports
            </button>
            <input
              aria-label="Report title"
              className="min-w-0 flex-1 bg-transparent text-2xl font-semibold tracking-tight text-white outline-none placeholder:text-slate-600"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Untitled report"
            />
            <AutosaveState status={autosave.status} retry={() => void autosave.retry()} />
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <select
              aria-label="Report type"
              className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-300"
              value={type}
              onChange={(event) => setType(event.target.value as (typeof reportTypes)[number])}
            >
              {reportTypes.map((value) => <option key={value}>{value}</option>)}
            </select>
            <select
              aria-label="Report status"
              className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-300"
              value={status}
              onChange={(event) => setStatus(event.target.value as (typeof reportStatuses)[number])}
            >
              {reportStatuses.map((value) => <option key={value}>{value}</option>)}
            </select>
            <span className="text-xs text-slate-600">Draft content saves automatically.</span>
          </div>
        </div>
        <Toolbar editor={editor} />
        <div className="mx-auto max-w-4xl"><EditorContent editor={editor} /></div>
      </div>

      <aside className="space-y-4">
        <InsertPanel data={insertables} onInsert={insertBlock} />
        <Exports
          projectId={projectId}
          reportId={s(report.id)}
          dirty={dirty}
        />
      </aside>
    </div>
  );
}

function AutosaveState({ status, retry }: { status: string; retry: () => void }) {
  if (status === "error")
    return (
      <button type="button" onClick={retry} className="shrink-0 text-xs text-red-300 hover:text-red-200">
        Save failed · Retry
      </button>
    );
  if (status === "conflict")
    return (
      <button type="button" onClick={() => window.location.reload()} className="shrink-0 text-xs text-amber-300 hover:text-amber-200">
        Changed elsewhere · Reload
      </button>
    );
  return (
    <span className="shrink-0 text-xs text-slate-500" aria-live="polite">
      {status === "saving" ? "Saving…" : status === "dirty" ? "Unsaved" : "Saved"}
    </span>
  );
}

function Toolbar({ editor }: { editor: Editor | null }) {
  if (!editor) return null;
  const button = (label: string, active: boolean, action: () => void) => (
    <button
      type="button"
      onClick={action}
      className={`rounded px-2 py-1 text-xs ${active ? "bg-slate-700 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-white"}`}
    >
      {label}
    </button>
  );
  return (
    <div className="sticky top-0 z-10 flex flex-wrap gap-1 border-b border-slate-800 bg-[#172016]/95 px-4 py-2 backdrop-blur">
      {button("H1", editor.isActive("heading", { level: 1 }), () => editor.chain().focus().toggleHeading({ level: 1 }).run())}
      {button("H2", editor.isActive("heading", { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run())}
      {button("H3", editor.isActive("heading", { level: 3 }), () => editor.chain().focus().toggleHeading({ level: 3 }).run())}
      <span className="mx-1 border-l border-slate-700" />
      {button("B", editor.isActive("bold"), () => editor.chain().focus().toggleBold().run())}
      {button("I", editor.isActive("italic"), () => editor.chain().focus().toggleItalic().run())}
      {button("•", editor.isActive("bulletList"), () => editor.chain().focus().toggleBulletList().run())}
      {button("1.", editor.isActive("orderedList"), () => editor.chain().focus().toggleOrderedList().run())}
      {button("Quote", editor.isActive("blockquote"), () => editor.chain().focus().toggleBlockquote().run())}
      {button("Code", editor.isActive("codeBlock"), () => editor.chain().focus().toggleCodeBlock().run())}
      {button("Link", editor.isActive("link"), () => {
        const previous = editor.getAttributes("link").href as string | undefined;
        const href = window.prompt("HTTP/HTTPS URL", previous ?? "https://");
        if (href === null) return;
        if (!href.trim()) editor.chain().focus().unsetLink().run();
        else editor.chain().focus().setLink({ href: href.trim() }).run();
      })}
      {button("Table", editor.isActive("table"), () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run())}
      <span className="mx-1 border-l border-slate-700" />
      {button("↶", false, () => editor.chain().focus().undo().run())}
      {button("↷", false, () => editor.chain().focus().redo().run())}
    </div>
  );
}

function Exports({
  projectId,
  reportId,
  dirty,
}: {
  projectId: string;
  reportId: string;
  dirty: boolean;
}) {
  return (
    <div className="card">
      <h3 className="font-semibold text-white">Downloads</h3>
      <div className="mt-3 flex flex-wrap gap-2">
        {["pdf", "md", "html"].map((format) => (
          <a
            key={format}
            className={`rounded border border-slate-700 px-3 py-2 text-sm ${dirty ? "cursor-not-allowed opacity-50" : "hover:border-amber-700"}`}
            href={dirty ? undefined : `/api/projects/${projectId}/reports/${reportId}/export/${format}`}
            aria-disabled={dirty}
          >
            {dirty ? `Saving before ${format.toUpperCase()}` : `Download ${format.toUpperCase()}`}
          </a>
        ))}
      </div>
    </div>
  );
}

function InsertPanel({
  data,
  onInsert,
}: {
  data: Record<string, Row[]>;
  onInsert: (kind: string, row: Row) => void;
}) {
  const [query, setQuery] = useState("");
  const entries = useMemo(
    () =>
      Object.entries(data)
        .flatMap(([kind, rows]) => rows.map((row) => ({ kind, row })))
        .filter(({ kind, row }) =>
          `${labelForKind(kind)} ${titleFor(kind, row)}`
            .toLowerCase()
            .includes(query.toLowerCase()),
        )
        .slice(0, 80),
    [data, query],
  );

  return (
    <div className="card">
      <h3 className="font-semibold text-white">Add CİTEM object</h3>
      <p className="mt-1 text-xs text-slate-500">Insert IOC, CVE, malware, campaign and other Investigation records into the draft.</p>
      <input
        className="field mt-3"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search project records"
      />
      <div className="mt-3 max-h-[420px] space-y-2 overflow-auto">
        {entries.map(({ kind, row }) => (
          <button
            key={`${kind}-${s(row.id)}`}
            type="button"
            onClick={() => onInsert(kind, row)}
            className="block w-full rounded border border-slate-800 p-2 text-left text-sm hover:border-amber-700/70"
          >
            <span className="text-xs font-semibold text-amber-300">{labelForKind(kind)}</span>
            <br />
            <span className="text-slate-200">{titleFor(kind, row)}</span>
          </button>
        ))}
        {!entries.length && <p className="py-4 text-center text-xs text-slate-500">No matching records.</p>}
      </div>
    </div>
  );
}

function labelForKind(kind: string) {
  const labels: Record<string, string> = {
    research_notes: "NOTE",
    evidence: "EVIDENCE",
    timeline_events: "TIMELINE",
    project_tasks: "TASK",
    threat_actors: "ACTOR",
    campaigns: "CAMPAIGN",
    indicators: "IOC",
    malware: "MALWARE",
    cves: "CVE",
    mitre_techniques: "MITRE",
  };
  return labels[kind] ?? kind.replaceAll("_", " ").toUpperCase();
}

function titleFor(kind: string, row: Row) {
  return (
    s(row.title) ||
    s(row.name) ||
    s(row.event_name) ||
    s(row.task_name) ||
    s(row.value) ||
    s(row.cve_id) ||
    `${s(row.technique_id)} ${s(row.technique_name)}`.trim() ||
    s(row.id)
  );
}

function summaryFor(kind: string, row: Row) {
  const fields: Record<string, string[]> = {
    research_notes: ["content", "updated_at"],
    evidence: ["type", "description", "source_url", "collection_date"],
    timeline_events: ["event_date", "description"],
    project_tasks: ["status", "priority", "deadline", "description"],
    threat_actors: ["aliases", "country", "motivations", "description"],
    campaigns: ["description", "start_date", "end_date", "targets"],
    indicators: ["value", "type", "confidence", "source", "first_seen", "last_seen"],
    malware: ["name", "family", "description", "behavior"],
    cves: ["cve_id", "severity", "affected_product", "exploit_status", "description"],
    mitre_techniques: ["technique_id", "technique_name", "tactic", "description"],
  };
  const safeFields = fields[kind] ?? ["description", "type", "status"];
  return safeFields
    .map((field) => {
      const value = row[field];
      const text = Array.isArray(value) ? value.join(", ") : s(value);
      return text ? `${field}: ${text}` : "";
    })
    .filter(Boolean)
    .join(" · ")
    .slice(0, 1500);
}
