"use client";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { deleteReport } from "@/app/actions";
function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      className="rounded-lg bg-red-500 px-4 py-2 font-semibold text-white disabled:opacity-60"
    >
      {pending ? "Deleting…" : "Delete"}
    </button>
  );
}
export function ReportDeleteForm({
  projectId,
  reportId,
  title,
  relationshipCount,
}: {
  projectId: string;
  reportId: string;
  title: string;
  relationshipCount: number;
}) {
  const [state, action] = useActionState(
    async (_previous: { error?: string; success?: string }, fd: FormData) =>
      deleteReport(projectId, reportId, title, fd),
    {},
  );
  return (
    <form action={action} className="mt-3 space-y-3">
      <p className="text-sm text-slate-400">
        Deleting this report will also clean up {relationshipCount} manual
        Report graph relationship{relationshipCount === 1 ? "" : "s"} plus any
        saved graph position for this report.
      </p>
      <input
        className="field"
        name="confirm"
        aria-label="Confirm report title"
        placeholder="Type report title"
      />
      {state.error && (
        <p role="alert" className="text-sm text-red-300">
          {state.error}
        </p>
      )}
      <Submit />
    </form>
  );
}
