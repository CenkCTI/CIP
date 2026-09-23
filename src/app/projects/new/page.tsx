import Link from "next/link";

import { createProject } from "@/app/actions";
import { ProjectForm } from "@/components/project-form";

export default function Page() {
  return (
    <section className="mx-auto max-w-5xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="citem-eyebrow">CİTEM / Intelligence production</p>
          <h1 className="citem-title mt-2">New investigation</h1>
          <p className="citem-subtitle mt-2 max-w-2xl">
            Start with the intelligence need. Build scope, supporting questions, and collection direction as the work develops.
          </p>
        </div>
        <Link className="citem-button-ghost" href="/projects">
          Back to investigations
        </Link>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="card p-5 sm:p-6">
          <ProjectForm action={createProject} />
        </div>

        <aside className="space-y-4">
          <div className="card">
            <p className="citem-label">Direction first</p>
            <h2 className="mt-2 text-base font-semibold text-stone-100">
              Keep creation lightweight
            </h2>
            <p className="mt-2 text-sm leading-6 text-stone-400">
              A new Investigation needs a clear question and purpose, not a completed analytical plan.
            </p>
            <div className="mt-4 space-y-3 border-t border-amber-900/20 pt-4 text-sm text-stone-400">
              <p><span className="mr-2 font-mono text-amber-400">01</span> Name the work.</p>
              <p><span className="mr-2 font-mono text-amber-400">02</span> State what must be understood.</p>
              <p><span className="mr-2 font-mono text-amber-400">03</span> State why the answer matters.</p>
            </div>
          </div>

          <div className="rounded border border-stone-800/70 bg-black/10 p-4">
            <p className="citem-label">Analyst control</p>
            <p className="mt-2 text-xs leading-5 text-stone-500">
              CİTEM does not infer actors, campaigns, evidence, or assessments from these fields. Direction remains analyst-authored.
            </p>
          </div>
        </aside>
      </div>
    </section>
  );
}
