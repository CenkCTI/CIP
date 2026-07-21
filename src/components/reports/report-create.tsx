"use client";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { createReport } from "@/app/actions";
import { reportStatuses, reportTypes } from "@/lib/reports/schema";
function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      className="rounded-lg bg-cyan-400 px-4 py-2 font-semibold text-slate-950 disabled:opacity-60"
    >
      {pending ? "Creating…" : "Create"}
    </button>
  );
}
export function ReportCreate({ projectId }: { projectId: string }) {
  const [state, action] = useActionState(
    createReport.bind(null, projectId),
    {},
  );
  return (
    <form action={action} className="mt-3 space-y-3">
      <input className="field" name="title" placeholder="Report title" />
      <select className="field" name="type">
        {reportTypes.map((t) => (
          <option key={t}>{t}</option>
        ))}
      </select>
      <select className="field" name="status">
        {reportStatuses.map((t) => (
          <option key={t}>{t}</option>
        ))}
      </select>
      {state.error && <p className="text-sm text-red-300">{state.error}</p>}
      <Submit />
    </form>
  );
}
