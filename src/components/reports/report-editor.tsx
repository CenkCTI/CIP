"use client";
import { useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { updateReport } from "@/app/actions";
import {
  canonicalReportRevision,
  reportStatuses,
  reportTypes,
} from "@/lib/reports/schema";
import { reportEditorExtensions } from "@/lib/reports/editor-extensions";

type Row = Record<string, unknown>;
const s = (v: unknown) => String(v ?? "");
function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      className="rounded-lg bg-cyan-400 px-4 py-2 font-semibold text-slate-950 disabled:opacity-60"
    >
      {pending ? "Saving…" : "Save report"}
    </button>
  );
}
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
  const [state, setState] = useState<{ success?: string; error?: string }>({});
  const [title, setTitle] = useState(s(report.title));
  const [type, setType] = useState(s(report.type));
  const [status, setStatus] = useState(s(report.status));
  const [content, setContent] = useState<Record<string, unknown>>(
    report.content as Record<string, unknown>,
  );
  const [saving, setSaving] = useState(false);
  const initialRevision = canonicalReportRevision({
    title: s(report.title),
    type: s(report.type),
    status: s(report.status),
    content: report.content,
  });
  const [savedRevision, setSavedRevision] = useState(initialRevision);
  const editor = useEditor({
    immediatelyRender: false,
    extensions: reportEditorExtensions(),
    content,
    editorProps: {
      attributes: {
        class:
          "min-h-96 rounded border border-slate-700 bg-slate-950 p-4 text-slate-100 outline-none prose-invert",
      },
    },
    onUpdate: ({ editor }) => {
      setContent(editor.getJSON());
    },
  });
  const currentRevision = canonicalReportRevision({
    title,
    type,
    status,
    content,
  });
  const dirty = currentRevision !== savedRevision;
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);
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
              { type: "text", marks: [{ type: "bold" }], text: `${kind}: ` },
              { type: "text", text: titleFor(kind, row) },
            ],
          },
          {
            type: "paragraph",
            content: [
              { type: "text", text: `Reference: ${kind}:${s(row.id)}` },
            ],
          },
          {
            type: "paragraph",
            content: [{ type: "text", text: summaryFor(kind, row) }],
          },
        ],
      })
      .run();
  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
      <form
        action={async (fd) => {
          const revision = canonicalReportRevision({
            title,
            type,
            status,
            content,
          });
          fd.set("title", title);
          fd.set("type", type);
          fd.set("status", status);
          fd.set("content", JSON.stringify(content));
          setSaving(true);
          const result = await updateReport(projectId, s(report.id), {}, fd);
          setState(result);
          setSaving(false);
          const displayed = canonicalReportRevision({
            title,
            type,
            status,
            content,
          });
          if (result.success && displayed === revision)
            setSavedRevision(revision);
        }}
        className="space-y-3"
      >
        <button
          type="button"
          className="rounded border border-slate-700 px-3 py-2 text-sm"
          onClick={() => {
            if (!dirty || confirm("Discard unsaved report changes?"))
              router.push(`/projects/${projectId}?tab=reports`);
          }}
        >
          Back to reports
        </button>
        <input type="hidden" name="content" value={JSON.stringify(content)} />
        <label className="block text-sm text-slate-300">
          Title
          <input
            className="field mt-1"
            name="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm text-slate-300">
            Type
            <select
              className="field mt-1"
              name="type"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              {reportTypes.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm text-slate-300">
            Status
            <select
              className="field mt-1"
              name="status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              {reportStatuses.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
        </div>
        <Toolbar editor={editor} />
        <EditorContent editor={editor} />
        <p className="text-sm text-slate-400" aria-live="polite">
          {saving
            ? "Saving…"
            : state.error
              ? `Error: ${state.error}`
              : dirty
                ? "Unsaved changes"
                : state.success
                  ? "Saved"
                  : "Loaded"}
        </p>
        <Submit />
      </form>
      <aside className="space-y-4">
        <Exports
          projectId={projectId}
          reportId={s(report.id)}
          dirty={dirty || saving}
        />
        <InsertPanel data={insertables} onInsert={insertBlock} />
      </aside>
    </div>
  );
}
function Toolbar({ editor }: { editor: Editor | null }) {
  if (!editor) return null;
  const b = (label: string, fn: () => void) => (
    <button
      type="button"
      onClick={fn}
      className="rounded border border-slate-700 px-2 py-1 text-sm"
    >
      {label}
    </button>
  );
  return (
    <div className="flex flex-wrap gap-2">
      {b("H1", () => editor.chain().focus().toggleHeading({ level: 1 }).run())}
      {b("H2", () => editor.chain().focus().toggleHeading({ level: 2 }).run())}
      {b("H3", () => editor.chain().focus().toggleHeading({ level: 3 }).run())}
      {b("Bold", () => editor.chain().focus().toggleBold().run())}
      {b("Italic", () => editor.chain().focus().toggleItalic().run())}
      {b("Bullets", () => editor.chain().focus().toggleBulletList().run())}
      {b("Numbers", () => editor.chain().focus().toggleOrderedList().run())}
      {b("Quote", () => editor.chain().focus().toggleBlockquote().run())}
      {b("Code", () => editor.chain().focus().toggleCodeBlock().run())}
      {b("Link", () => {
        const href = prompt("HTTP/HTTPS URL");
        if (href) editor.chain().focus().setLink({ href }).run();
      })}
      {b("Table", () =>
        editor
          .chain()
          .focus()
          .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
          .run(),
      )}
      {b("Clear", () =>
        editor.chain().focus().unsetAllMarks().clearNodes().run(),
      )}
      {b("Undo", () => editor.chain().focus().undo().run())}
      {b("Redo", () => editor.chain().focus().redo().run())}
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
        {["pdf", "md", "html"].map((f) => (
          <a
            key={f}
            className="rounded border border-slate-700 px-3 py-2 text-sm"
            href={
              dirty
                ? undefined
                : `/api/projects/${projectId}/reports/${reportId}/export/${f}`
            }
            aria-disabled={dirty}
          >
            {dirty
              ? `Save before ${f.toUpperCase()}`
              : `Download ${f.toUpperCase()}`}
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
  onInsert: (k: string, r: Row) => void;
}) {
  const [q, setQ] = useState("");
  const entries = useMemo(
    () =>
      Object.entries(data)
        .flatMap(([k, rows]) => rows.map((r) => ({ k, r })))
        .filter((x) =>
          titleFor(x.k, x.r).toLowerCase().includes(q.toLowerCase()),
        )
        .slice(0, 80),
    [data, q],
  );
  return (
    <div className="card">
      <h3 className="font-semibold text-white">Insert Project Data</h3>
      <input
        className="field mt-3"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search current project records"
      />
      <div className="mt-3 max-h-96 space-y-2 overflow-auto">
        {entries.map(({ k, r }) => (
          <button
            key={`${k}-${s(r.id)}`}
            type="button"
            onClick={() => onInsert(k, r)}
            className="block w-full rounded border border-slate-800 p-2 text-left text-sm hover:border-cyan-400"
          >
            <span className="font-semibold text-cyan-200">{k}</span>
            <br />
            {titleFor(k, r)}
          </button>
        ))}
      </div>
    </div>
  );
}
function titleFor(k: string, r: Row) {
  return (
    s(r.title) ||
    s(r.name) ||
    s(r.event_name) ||
    s(r.task_name) ||
    s(r.value) ||
    s(r.cve_id) ||
    `${s(r.technique_id)} ${s(r.technique_name)}`.trim() ||
    s(r.id)
  );
}
function summaryFor(k: string, r: Row) {
  const fields: Record<string, string[]> = {
    research_notes: ["content", "updated_at"],
    evidence: ["type", "description", "source_url", "collection_date"],
    timeline_events: ["event_date", "description"],
    project_tasks: ["status", "priority", "deadline", "description"],
    threat_actors: ["aliases", "country", "motivations", "description"],
    campaigns: ["description", "start_date", "end_date", "targets"],
    indicators: [
      "value",
      "type",
      "confidence",
      "source",
      "first_seen",
      "last_seen",
    ],
    malware: ["name", "family", "description", "behavior"],
    cves: [
      "cve_id",
      "severity",
      "affected_product",
      "exploit_status",
      "description",
    ],
    mitre_techniques: [
      "technique_id",
      "technique_name",
      "tactic",
      "description",
    ],
  };
  const safeFields = fields[k] ?? ["description", "type", "status"];
  return safeFields
    .map((field) => {
      const value = r[field];
      const text = Array.isArray(value) ? value.join(", ") : s(value);
      return text ? `${field}: ${text}` : "";
    })
    .filter(Boolean)
    .join(" · ")
    .slice(0, 1500);
}
