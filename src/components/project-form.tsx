"use client";

import { ActionForm, SubmitButton } from "@/components/form-status";
import { InvestigationSummary } from "@/components/investigation-summary";
import {
  assessmentConfidenceLevels,
  formatProjectDateInput,
  investigationStatuses,
  priorities,
  researchTypes,
  type Project,
} from "@/lib/projects/schema";

type FormState = { error?: string; success?: string };

type ProjectFormProps = {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  project?: Partial<Project>;
};

export function ProjectForm({ action, project }: ProjectFormProps) {
  const editing = Boolean(project?.id);

  return (
    <>
      {editing && project?.id ? (
        <InvestigationSummary project={project as Project} />
      ) : null}

      <ActionForm action={action}>
        <input
          type="hidden"
          name="_form_mode"
          value={editing ? "edit" : "create"}
        />

        <label className="block text-sm text-stone-300">
          Investigation title
          <input
            className="field mt-1"
            name="name"
            required
            maxLength={120}
            defaultValue={project?.name ?? ""}
          />
        </label>

        <label className="block text-sm text-stone-300">
          Research question
          <textarea
            className="field mt-1 min-h-28"
            name="research_question"
            required={!editing}
            maxLength={2000}
            defaultValue={project?.research_question ?? ""}
          />
          <span className="mt-1 block text-xs leading-5 text-stone-500">
            The specific technical question this Investigation is intended to answer.
          </span>
        </label>

        <label className="block text-sm text-stone-300">
          Description
          <textarea
            className="field mt-1 min-h-24"
            name="description"
            maxLength={2000}
            defaultValue={project?.description ?? ""}
          />
        </label>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm text-stone-300">
            Research type
            <select
              className="field mt-1"
              name="research_type"
              defaultValue={project?.research_type ?? "CTI"}
            >
              {researchTypes.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>

          <label className="block text-sm text-stone-300">
            Priority
            <select
              className="field mt-1"
              name="priority"
              defaultValue={project?.priority ?? "MEDIUM"}
            >
              {priorities.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>

          <label className="block text-sm text-stone-300">
            Investigation status
            <select
              className="field mt-1"
              name="investigation_status"
              defaultValue={project?.investigation_status ?? "DRAFT"}
            >
              {investigationStatuses.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>

          <label className="block text-sm text-stone-300">
            Assessment confidence
            <select
              className="field mt-1"
              name="assessment_confidence"
              defaultValue={project?.assessment_confidence ?? ""}
            >
              <option value="">Not assessed</option>
              {assessmentConfidenceLevels.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
            <span className="mt-1 block text-xs leading-5 text-stone-500">
              The strength and completeness of the information supporting the current assessment.
            </span>
          </label>
        </div>

        <label className="block text-sm text-stone-300">
          Current assessment
          <textarea
            className="field mt-1 min-h-36"
            name="current_assessment"
            maxLength={10000}
            defaultValue={project?.current_assessment ?? ""}
          />
          <span className="mt-1 block text-xs leading-5 text-stone-500">
            The analyst’s present conclusion. This may change as new evidence is added.
          </span>
        </label>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm text-stone-300">
            Tags
            <input
              className="field mt-1"
              name="tags"
              placeholder="phishing, energy, infrastructure"
              defaultValue={project?.tags?.join(", ") ?? ""}
            />
          </label>

          <label className="block text-sm text-stone-300">
            Closed date
            <input
              className="field mt-1"
              name="closed_at"
              type="date"
              defaultValue={formatProjectDateInput(project?.closed_at)}
            />
            <span className="mt-1 block text-xs leading-5 text-stone-500">
              Leave empty for an open Investigation. Clear this field when reopening.
            </span>
          </label>
        </div>

        <SubmitButton>
          {editing ? "Save investigation" : "Create investigation"}
        </SubmitButton>
      </ActionForm>
    </>
  );
}
