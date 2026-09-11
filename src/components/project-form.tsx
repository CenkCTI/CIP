"use client";

import { ActionForm, SubmitButton } from "@/components/form-status";
import { InvestigationDirectionWorkspace } from "@/components/investigations/direction-workspace";
import { priorities, type Project } from "@/lib/projects/schema";

type FormState = { error?: string; success?: string };

type ProjectFormProps = {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  project?: Partial<Project>;
};

function FieldHint({ children }: { children: React.ReactNode }) {
  return <span className="mt-1.5 block text-xs leading-5 text-stone-500">{children}</span>;
}

function CreateInvestigationForm({ action }: { action: ProjectFormProps["action"] }) {
  return (
    <ActionForm action={action}>
      <input type="hidden" name="_form_mode" value="create" />
      <input type="hidden" name="research_type" value="CTI" />
      <input type="hidden" name="investigation_status" value="DRAFT" />
      <input type="hidden" name="assessment_confidence" value="" />

      <div className="rounded border border-amber-900/25 bg-black/10 p-4 sm:p-5">
        <p className="citem-label">Stage 1 / Direction</p>
        <p className="mt-2 text-sm leading-6 text-stone-400">
          Start with the intelligence need. Scope, supporting questions, information gaps, and decision context can be refined after creation.
        </p>
      </div>

      <label className="block text-sm text-stone-300">
        Investigation title
        <input
          autoFocus
          className="field mt-1.5"
          maxLength={120}
          name="name"
          placeholder="Poland cyber pre-attack pattern study"
          required
        />
        <FieldHint>Use a working title that remains understandable as the research evolves.</FieldHint>
      </label>

      <label className="block text-sm text-stone-300">
        Primary intelligence question
        <textarea
          className="field mt-1.5 min-h-32"
          maxLength={2000}
          minLength={10}
          name="research_question"
          placeholder="What are we trying to understand?"
          required
        />
        <FieldHint>
          Frame the operational problem. Do not make an IOC, feed, tool, actor, or platform field a prerequisite for opening the Investigation.
        </FieldHint>
      </label>

      <label className="block text-sm text-stone-300">
        Purpose / objective
        <textarea
          className="field mt-1.5 min-h-24"
          maxLength={2000}
          minLength={5}
          name="purpose"
          placeholder="Why does this Investigation exist and what should the answer enable?"
          required
        />
        <FieldHint>
          Keep this short. The intended consumer and decision context can be added when they are known.
        </FieldHint>
      </label>

      <label className="block text-sm text-stone-300 sm:max-w-xs">
        Priority
        <select className="field mt-1.5" defaultValue="MEDIUM" name="priority">
          {priorities.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
        <FieldHint>Priority represents work urgency, not threat severity.</FieldHint>
      </label>

      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-amber-900/20 pt-4">
        <p className="max-w-xl text-xs leading-5 text-stone-500">
          The Investigation opens in DRAFT. CİTEM does not infer actors, campaigns, Evidence, relationships, or assessments from these fields.
        </p>
        <SubmitButton>Create investigation</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function ProjectForm({ action, project }: ProjectFormProps) {
  if (!project?.id) return <CreateInvestigationForm action={action} />;
  return <InvestigationDirectionWorkspace project={project as Project} />;
}
