"use client";
import { useState, useTransition } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  authorizeEvidenceUpload,
  createNote,
  createTask,
  createTimelineEvent,
  createUrlEvidence,
  deleteEvidence,
  deleteNote,
  deleteTask,
  deleteTimelineEvent,
  finalizeEvidenceUpload,
  getEvidenceDownloadUrl,
  replaceEvidenceFile,
  updateEvidence,
  updateNote,
  updateTask,
  updateTaskStatus,
  updateTimelineEvent,
} from "@/app/actions";
import { createClient } from "@/lib/supabase/browser";
import {
  evidenceTypeForFile,
  fileEvidenceTypes,
  taskPriorities,
  taskStatuses,
  urlEvidenceTypes,
  validateUpload,
} from "@/lib/workspace/schema";

type State = { error?: string; success?: string };
type Row = Record<string, unknown>;
const s = (v: unknown) => String(v ?? "");
const d = (v: unknown) => s(v).slice(0, 16);
const tags = (v: unknown) => (Array.isArray(v) ? v.join(", ") : "");
function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      className="rounded-lg bg-cyan-300 px-4 py-2 font-semibold text-slate-950 disabled:opacity-60"
    >
      {pending ? "Working…" : children}
    </button>
  );
}
function DeleteButton() {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      className="rounded-lg bg-red-500 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
    >
      {pending ? "Deleting…" : "Delete"}
    </button>
  );
}
function AForm({
  action,
  children,
}: {
  action: (state: State, formData: FormData) => Promise<State>;
  children: React.ReactNode;
}) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-3">
      {children}
      {state.error && (
        <p role="alert" className="text-sm text-red-300">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="text-sm text-emerald-300">{state.success}</p>
      )}
    </form>
  );
}
export function NoteCreate({ projectId }: { projectId: string }) {
  return (
    <AForm action={createNote.bind(null, projectId)}>
      <input className="field" name="title" placeholder="Note title" />
      <textarea
        className="field min-h-32"
        name="content"
        placeholder="Plain-text note"
      />
      <input
        className="field"
        name="tags"
        placeholder="tags, comma, separated"
      />
      <Submit>Create note</Submit>
    </AForm>
  );
}
export function NoteEdit({
  projectId,
  note,
}: {
  projectId: string;
  note: Row;
}) {
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-sm text-cyan-200">
        Edit note
      </summary>
      <AForm action={updateNote.bind(null, projectId, s(note.id))}>
        <input className="field" name="title" defaultValue={s(note.title)} />
        <textarea
          className="field min-h-32"
          name="content"
          defaultValue={s(note.content)}
        />
        <input className="field" name="tags" defaultValue={tags(note.tags)} />
        <Submit>Save note</Submit>
      </AForm>
    </details>
  );
}
export function DeleteNote({
  projectId,
  id,
}: {
  projectId: string;
  id: string;
}) {
  return (
    <form action={deleteNote.bind(null, projectId, id)}>
      <DeleteButton />
    </form>
  );
}
const phases = [
  "UNKNOWN",
  "INFRASTRUCTURE_PREPARATION",
  "TARGETING",
  "DELIVERY",
  "INITIAL_ACCESS",
  "EXECUTION",
  "PERSISTENCE",
  "COMMAND_AND_CONTROL",
  "COLLECTION",
  "EXFILTRATION",
  "IMPACT",
  "INFRASTRUCTURE_CHANGE",
  "OTHER",
];
function TimelineFields({ event = {} }: { event?: Row }) {
  return (
    <>
      <input
        className="field"
        name="event_name"
        placeholder="Event name"
        defaultValue={s(event.event_name)}
      />
      <div className="grid gap-2 md:grid-cols-2">
        <input
          className="field"
          name="event_date"
          aria-label="Event start"
          type="datetime-local"
          defaultValue={d(event.event_date)}
        />
        <input
          className="field"
          name="occurred_end_at"
          aria-label="Event end"
          type="datetime-local"
          defaultValue={d(event.occurred_end_at)}
        />
      </div>
      <textarea
        className="field"
        name="description"
        placeholder="Description"
        defaultValue={s(event.description)}
      />
      <div className="grid gap-2 md:grid-cols-4">
        <select
          className="field"
          name="basis"
          defaultValue={s(event.basis) || "OBSERVED"}
        >
          <option>OBSERVED</option>
          <option>INFERRED</option>
        </select>
        <select
          className="field"
          name="activity_phase"
          defaultValue={s(event.activity_phase) || "UNKNOWN"}
        >
          {phases.map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        <select
          className="field"
          name="assessment_status"
          defaultValue={s(event.assessment_status) || "RECORDED"}
        >
          {["RECORDED", "ASSESSED", "DISPUTED", "RETRACTED"].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        <select
          className="field"
          name="confidence"
          defaultValue={s(event.confidence) || "MEDIUM"}
        >
          {["LOW", "MEDIUM", "HIGH"].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </div>
      <textarea
        className="field"
        name="analyst_rationale"
        placeholder="Analyst rationale (required for inferred, disputed, or retracted events)"
        defaultValue={s(event.analyst_rationale)}
      />
      <input
        type="hidden"
        name="related_entity_type"
        value={s(event.related_entity_type)}
      />
      <input
        type="hidden"
        name="related_entity_id"
        value={s(event.related_entity_id)}
      />
    </>
  );
}
export function TimelineCreate({ projectId }: { projectId: string }) {
  return (
    <AForm action={createTimelineEvent.bind(null, projectId)}>
      <TimelineFields />
      <Submit>Create event</Submit>
    </AForm>
  );
}
export function TimelineEdit({
  projectId,
  event,
}: {
  projectId: string;
  event: Row;
}) {
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-sm text-cyan-200">
        Edit event assessment
      </summary>
      <AForm action={updateTimelineEvent.bind(null, projectId, s(event.id))}>
        <TimelineFields event={event} />
        <Submit>Save event</Submit>
      </AForm>
    </details>
  );
}
export function DeleteTimeline({
  projectId,
  id,
}: {
  projectId: string;
  id: string;
}) {
  return (
    <AForm action={deleteTimelineEvent.bind(null, projectId, id)}>
      <DeleteButton />
    </AForm>
  );
}
export function TaskCreate({
  projectId,
  ownerId,
}: {
  projectId: string;
  ownerId: string;
}) {
  return (
    <AForm action={createTask.bind(null, projectId)}>
      <input className="field" name="task_name" placeholder="Task name" />
      <input type="hidden" name="assigned_user_id" value={ownerId} />
      <select className="field" name="status">
        {taskStatuses.map((x) => (
          <option key={x}>{x}</option>
        ))}
      </select>
      <select className="field" name="priority">
        {taskPriorities.map((x) => (
          <option key={x}>{x}</option>
        ))}
      </select>
      <input className="field" name="deadline" type="datetime-local" />
      <input className="field" name="description" placeholder="Description" />
      <Submit>Create task</Submit>
    </AForm>
  );
}
export function TaskEdit({
  projectId,
  task,
  ownerId,
}: {
  projectId: string;
  task: Row;
  ownerId: string;
}) {
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-xs text-cyan-200">
        Edit task
      </summary>
      <AForm action={updateTask.bind(null, projectId, s(task.id))}>
        <input
          className="field"
          name="task_name"
          defaultValue={s(task.task_name)}
        />
        <input type="hidden" name="assigned_user_id" value={ownerId} />
        <textarea
          className="field"
          name="description"
          defaultValue={s(task.description)}
        />
        <select className="field" name="status" defaultValue={s(task.status)}>
          {taskStatuses.map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        <select
          className="field"
          name="priority"
          defaultValue={s(task.priority)}
        >
          {taskPriorities.map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        <input
          className="field"
          name="deadline"
          type="datetime-local"
          defaultValue={d(task.deadline)}
        />
        <Submit>Save task</Submit>
      </AForm>
    </details>
  );
}
export function TaskMove({
  projectId,
  id,
  status,
}: {
  projectId: string;
  id: string;
  status: "TODO" | "IN_PROGRESS" | "COMPLETED";
}) {
  return (
    <form action={updateTaskStatus.bind(null, projectId, id, status)}>
      <button className="text-xs text-cyan-200">Move to {status}</button>
    </form>
  );
}
export function DeleteTask({
  projectId,
  id,
}: {
  projectId: string;
  id: string;
}) {
  return (
    <form action={deleteTask.bind(null, projectId, id)}>
      <button className="text-xs text-red-300">Delete</button>
    </form>
  );
}
export function EvidenceUrlCreate({ projectId }: { projectId: string }) {
  return (
    <AForm action={createUrlEvidence.bind(null, projectId)}>
      <EvidenceFields types={urlEvidenceTypes} showUrl />
      <Submit>Save URL evidence</Submit>
    </AForm>
  );
}
function EvidenceFields({
  row,
  types,
  showUrl,
  type,
  onTypeChange,
}: {
  row?: Row;
  types: readonly string[];
  showUrl?: boolean;
  type?: string;
  onTypeChange?: (value: string) => void;
}) {
  return (
    <>
      <input
        className="field"
        name="title"
        placeholder="Evidence title"
        defaultValue={s(row?.title)}
      />
      <select
        aria-label="Evidence type"
        className="field"
        name="type"
        value={type}
        onChange={
          onTypeChange ? (event) => onTypeChange(event.target.value) : undefined
        }
        defaultValue={type === undefined ? s(row?.type) || types[0] : undefined}
      >
        {types.map((x) => (
          <option key={x}>{x}</option>
        ))}
      </select>
      {showUrl ? (
        <input
          aria-label="Source URL"
          className="field"
          name="source_url"
          type="url"
          required
          placeholder="https:// source URL"
          defaultValue={s(row?.source_url)}
        />
      ) : (
        <input type="hidden" name="source_url" value="" />
      )}
      <input
        aria-label="Evidence collection date"
        className="field"
        name="collection_date"
        type="datetime-local"
        defaultValue={d(row?.collection_date)}
      />
      <input
        className="field"
        name="tags"
        placeholder="tags"
        defaultValue={tags(row?.tags)}
      />
      <textarea
        className="field"
        name="description"
        placeholder="Description"
        defaultValue={s(row?.description)}
      />
    </>
  );
}
export function EvidenceEdit({
  projectId,
  evidence,
}: {
  projectId: string;
  evidence: Row;
}) {
  const fileBacked = Boolean(evidence.storage_path);
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-sm text-cyan-200">
        Edit evidence
      </summary>
      <AForm action={updateEvidence.bind(null, projectId, s(evidence.id))}>
        <EvidenceFields
          row={evidence}
          types={fileBacked ? fileEvidenceTypes : urlEvidenceTypes}
          showUrl={!fileBacked}
        />
        <Submit>Save evidence</Submit>
      </AForm>
      {fileBacked ? (
        <EvidenceReplace projectId={projectId} evidenceId={s(evidence.id)} />
      ) : null}
    </details>
  );
}
export function EvidenceDownload({
  projectId,
  id,
}: {
  projectId: string;
  id: string;
}) {
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await getEvidenceDownloadUrl(projectId, id);
          if (r.url) window.open(r.url, "_blank", "noopener,noreferrer");
          else setMsg(r.error ?? "Unable to create download URL.");
        })
      }
      className="text-cyan-200"
    >
      {pending ? "Preparing…" : "View / Download"}
      {msg && (
        <span role="alert" className="ml-2 text-red-300">
          {msg}
        </span>
      )}
    </button>
  );
}
export function DeleteEvidence({
  projectId,
  id,
}: {
  projectId: string;
  id: string;
}) {
  return (
    <form action={deleteEvidence.bind(null, projectId, id)}>
      <DeleteButton />
    </form>
  );
}
export function EvidenceUpload({ projectId }: { projectId: string }) {
  const [status, setStatus] = useState<State>({});
  const [progress, setProgress] = useState(0);
  const [pending, setPending] = useState(false);
  const [evidenceType, setEvidenceType] =
    useState<(typeof fileEvidenceTypes)[number]>("FILE");
  function selectFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const derived = evidenceTypeForFile(file);
    if (derived) setEvidenceType(derived);
  }
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    if (!projectId) {
      setStatus({ error: "Project is required before uploading evidence." });
      return;
    }
    setPending(true);
    setStatus({});
    setProgress(0);
    const form = e.currentTarget;
    const fd = new FormData(form);
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setPending(false);
      setStatus({ error: "Choose a file to upload." });
      return;
    }
    const bad = validateUpload(file);
    if (bad) {
      setPending(false);
      setStatus({ error: bad });
      return;
    }
    const derived = evidenceTypeForFile(file);
    if (!derived) {
      setPending(false);
      setStatus({ error: "Unable to determine a file-backed evidence type." });
      return;
    }
    const metadata = {
      title: fd.get("title"),
      type: derived,
      description: fd.get("description") ?? "",
      source_url: "",
      collection_date: fd.get("collection_date"),
      tags: fd.get("tags") ?? "",
      file_name: file.name,
      mime_type: file.type,
      file_size: file.size,
    };
    const auth = await authorizeEvidenceUpload(projectId, metadata);
    if (!auth.path || !auth.token) {
      setPending(false);
      setStatus({ error: auth.error ?? "Signed upload authorization failed." });
      return;
    }
    const supabase = createClient();
    const timer = window.setInterval(
      () => setProgress((value) => Math.min(value + 10, 90)),
      150,
    );
    const upload = await supabase.storage
      .from("evidence")
      .uploadToSignedUrl(auth.path, auth.token, file);
    window.clearInterval(timer);
    if (upload.error) {
      setPending(false);
      setProgress(0);
      setStatus({
        error: `Signed byte upload failed: ${upload.error.message}`,
      });
      return;
    }
    setProgress(100);
    const final = await finalizeEvidenceUpload(projectId, {
      ...metadata,
      storage_path: auth.path,
      original_file_name: file.name,
    });
    setPending(false);
    setStatus(
      final.error
        ? { error: `Evidence metadata finalization failed: ${final.error}` }
        : final,
    );
    if (final.success) {
      form.reset();
      setEvidenceType("FILE");
    }
  }
  return (
    <form onSubmit={onSubmit} className="card space-y-3">
      <EvidenceFields
        types={fileEvidenceTypes}
        type={evidenceType}
        onTypeChange={(value) =>
          setEvidenceType(value as (typeof fileEvidenceTypes)[number])
        }
      />
      <input
        aria-label="Evidence file"
        className="field"
        name="file"
        type="file"
        accept=".png,.jpg,.jpeg,.pdf,.pcap,.log,.txt"
        onChange={selectFile}
      />
      <p className="text-xs text-slate-500">
        Type is derived from the selected file. Allowed: png, jpg, jpeg, pdf,
        pcap, log, txt up to 20 MB.
      </p>
      {pending && (
        <progress className="w-full" value={progress} max={100}>
          {progress}%
        </progress>
      )}
      <button
        disabled={pending}
        className="rounded-lg bg-cyan-300 px-4 py-2 font-semibold text-slate-950 disabled:opacity-60"
      >
        {pending ? "Uploading…" : "Upload file evidence"}
      </button>
      {status.error && (
        <p role="alert" className="text-sm text-red-300">
          {status.error}
        </p>
      )}
      {status.success && (
        <p className="text-sm text-emerald-300">{status.success}</p>
      )}
    </form>
  );
}
function EvidenceReplace({
  projectId,
  evidenceId,
}: {
  projectId: string;
  evidenceId: string;
}) {
  const [status, setStatus] = useState<State>({});
  const [pending, setPending] = useState(false);
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    const fd = new FormData(e.currentTarget);
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setPending(false);
      setStatus({ error: "Choose a replacement file." });
      return;
    }
    const bad = validateUpload(file);
    if (bad) {
      setPending(false);
      setStatus({ error: bad });
      return;
    }
    const replacementType = evidenceTypeForFile(file);
    if (!replacementType) {
      setPending(false);
      setStatus({ error: "Unable to determine a file-backed evidence type." });
      return;
    }
    const auth = await authorizeEvidenceUpload(projectId, {
      title: "Replacement",
      type: replacementType,
      description: "",
      source_url: "",
      collection_date: new Date().toISOString(),
      tags: "",
      file_name: file.name,
      mime_type: file.type,
      file_size: file.size,
    });
    if (!auth.path || !auth.token) {
      setPending(false);
      setStatus({ error: auth.error ?? "Signed upload authorization failed." });
      return;
    }
    const upload = await createClient()
      .storage.from("evidence")
      .uploadToSignedUrl(auth.path, auth.token, file);
    if (upload.error) {
      setPending(false);
      setStatus({
        error: `Signed byte upload failed: ${upload.error.message}`,
      });
      return;
    }
    const final = await replaceEvidenceFile(projectId, evidenceId, {
      storage_path: auth.path,
      original_file_name: file.name,
      mime_type: file.type,
      file_size: file.size,
    });
    setPending(false);
    setStatus(
      final.error
        ? { error: `Evidence metadata finalization failed: ${final.error}` }
        : final,
    );
    if (final.success) e.currentTarget.reset();
  }
  return (
    <form onSubmit={onSubmit} className="mt-3 space-y-2">
      <label className="text-sm text-slate-300">Replace stored file</label>
      <input className="field" name="file" type="file" />
      <button
        disabled={pending}
        className="rounded-lg border border-slate-700 px-3 py-2 text-sm"
      >
        {pending ? "Replacing…" : "Replace file"}
      </button>
      {status.error && (
        <p role="alert" className="text-sm text-red-300">
          {status.error}
        </p>
      )}
      {status.success && (
        <p className="text-sm text-emerald-300">{status.success}</p>
      )}
    </form>
  );
}
