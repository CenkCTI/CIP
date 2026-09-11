"use client";

import { ActionForm, SubmitButton } from "@/components/form-status";
import { InvestigationSummary } from "@/components/investigation-summary";
import {
  assessmentConfidenceLevels,
  formatLineList,
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

function FieldHint({ children }: { children: React.ReactNode }) {
  return <span className="mt-1.5 block text-xs leading-5 text-stone-500">{children}</span>;
}

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="border-b border-amber-900/20 pb-3">
      <p className="citem-label">{eyebrow}</p>
      <h3 className="mt-1 text-base font-semibold text-stone-100">{title}</h3>
      {description ? (
        <p className="mt-1 max-w-3xl text-sm leading-6 text-stone-500">{description}</p>
      ) : null}
    </div>
  );
}

function CreateInvestigationForm({
  action,
}: {
  action: ProjectFormProps["action"];
}) {
  return (
    <ActionForm action={action}>
      <input type="hidden" name="_form_mode" value="create" />
      <input type="hidden" name="research_type" value="CTI" />
      <input type="hidden" name="investigation_status" value="DRAFT" />
      <input type="hidden" name="assessment_confidence" value="" />

      <div className="rounded border border-amber-900/25 bg-black/10 p-4 sm:p-5">
        <p className="citem-label">Stage 1 / Direction</p>
        <p className="mt-2 text-sm leading-6 text-stone-400">
          Start with the intelligence need. Scope, supporting questions, gaps, and decision context can be refined after the Investigation is created.
        </p>
      </div>

      <label className="block text-sm text-stone-300">
        Investigation title
        <input
          className="field mt-1.5"
          name="name"
          required
          maxLength={120}
          autoFocus
          placeholder="Poland cyber pre-attack pattern study"
        />
        <FieldHint>Use a working title that stays understandable as the research evolves.</FieldHint>
      </label>

      <label className="block text-sm text-stone-300">
        Primary intelligence question
        <textarea
          className="field mt-1.5 min-h-32"
          name="research_question"
          required
          maxLength={2000}
          placeholder="What are we trying to understand?"
        />
        <FieldHint>
          Frame the question around the operational problem, not around a tool, feed, IOC, or entity type.
        </FieldHint>
      </label>

      <label className="block text-sm text-stone-300">
        Purpose / objective
        <textarea
          className="field mt-1.5 min-h-24"
          name="purpose"
          required
          maxLength={2000}
          placeholder="Why does this Investigation exist and what should the answer enable?"
        />
        <FieldHint>
          Keep this short. Decision context and intended consumer can be added from the Investigation overview.
        </FieldHint>
      </label>

      <label className="block text-sm text-stone-300 sm:max-w-xs">
        Priority
        <select className="field mt-1.5" name="priority" defaultValue="MEDIUM">
          {priorities.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
      </label>

      <div className="flex items-center justify-between gap-4 border-t border-amber-900/20 pt-4">
        <p className="text-xs leading-5 text-stone-500">
          The Investigation opens in DRAFT. Nothing else is created or inferred automatically.
        </p>
        <SubmitButton>Create investigation</SubmitButton>
      </div>
    </ActionForm>
  );
}

function EditInvestigationForm({
  action,
  project,
}: {
  action: ProjectFormProps["action"];
  project: Partial<Project>;
}) {
  return (
    <ActionForm action={action}>
      <input type="hidden" name="_form_mode" value="edit" />

      <section className="space-y-4">
        <SectionHeading
          eyebrow="Direction"
          title="Intelligence requirement"
          description="Keep the Investigation anchored to the question it is intended to answer."
        />

        <label className="block text-sm text-stone-300">
          Investigation title
          <input
            className="field mt-1.5"
            name="name"
            required
            maxLength={120}
            defaultValue={project.name ?? ""}
          />
        </label>

        <label className="block text-sm text-stone-300">
          Primary intelligence question
          <textarea
            className="field mt-1.5 min-h-28"
            name="research_question"
            maxLength={2000}
            defaultValue={project.research_question ?? ""}
          />
        </label>

        <label className="block text-sm text-stone-300">
          Purpose / objective
          <textarea
            className="field mt-1.5 min-h-24"
            name="purpose"
            maxLength={2000}
            defaultValue={project.purpose ?? ""}
          />
          <FieldHint>Why this question matters and what a useful answer should enable.</FieldHint>
        </label>
      </section>

      <section className="space-y-4 pt-3">
        <SectionHeading
          eyebrow="Decision context"
          title="Who will use the intelligence?"
          description="Describe the consumer and intended use without turning the Investigation into a rigid request form."
        />

        <div className="grid gap-4 lg:grid-cols-2">
          <label className="block text-sm text-stone-300">
            Intended consumer
            <input
              className="field mt-1.5"
              name="intended_consumer"
              maxLength={500}
              defaultValue={project.intended_consumer ?? ""}
              placeholder="CTI lead, strategic analyst, SOC leadership…"
            />
          </label>

          <label className="block text-sm text-stone-300">
            Expected product
            <input
              className="field mt-1.5"
              name="expected_product_type"
              maxLength={200}
              defaultValue={project.expected_product_type ?? ""}
              placeholder="Operational threat assessment"
            />
          </label>
        </div>

        <label className="block text-sm text-stone-300">
          Decision / intelligence use
          <textarea
            className="field mt-1.5 min-h-24"
            name="decision_context"
            maxLength={3000}
            defaultValue={project.decision_context ?? ""}
            placeholder="What should this intelligence help the consumer understand, prioritize, monitor, or decide?"
          />
        </label>
      </section>

      <section className="space-y-4 pt-3">
        <SectionHeading
          eyebrow="Scope"
          title="Research boundaries"
          description="These fields guide collection; they do not prevent the analyst from following relevant leads. Enter one item per line."
        />

        <div className="grid gap-4 lg:grid-cols-2">
          <label className="block text-sm text-stone-300">
            Geography
            <textarea
              className="field mt-1.5 min-h-24"
              name="scope_geography"
              defaultValue={formatLineList(project.scope_geography)}
              placeholder={"Poland\nBelarus"}
            />
          </label>

          <label className="block text-sm text-stone-300">
            Sectors / target environment
            <textarea
              className="field mt-1.5 min-h-24"
              name="scope_sectors"
              defaultValue={formatLineList(project.scope_sectors)}
              placeholder={"Energy\nCritical infrastructure"}
            />
          </label>

          <label className="block text-sm text-stone-300">
            Activity / threat types
            <textarea
              className="field mt-1.5 min-h-24"
              name="scope_activity_types"
              defaultValue={formatLineList(project.scope_activity_types)}
              placeholder={"Disruptive\nDestructive"}
            />
          </label>

          <label className="block text-sm text-stone-300">
            Actors / activity clusters
            <textarea
              className="field mt-1.5 min-h-24"
              name="scope_actors"
              defaultValue={formatLineList(project.scope_actors)}
              placeholder="Leave blank when the actor is not part of the initial scope"
            />
          </label>

          <label className="block text-sm text-stone-300">
            Technologies / environments
            <textarea
              className="field mt-1.5 min-h-24"
              name="scope_technologies"
              defaultValue={formatLineList(project.scope_technologies)}
              placeholder={"OT / ICS\nFortiGate"}
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm text-stone-300">
              Scope start
              <input
                className="field mt-1.5"
                name="scope_time_start"
                type="date"
                defaultValue={project.scope_time_start ?? ""}
              />
            </label>
            <label className="block text-sm text-stone-300">
              Scope end
              <input
                className="field mt-1.5"
                name="scope_time_end"
                type="date"
                defaultValue={project.scope_time_end ?? ""}
              />
            </label>
          </div>
        </div>

        <label className="block text-sm text-stone-300">
          Explicitly out of scope
          <textarea
            className="field mt-1.5 min-h-20"
            name="out_of_scope"
            maxLength={2000}
            defaultValue={project.out_of_scope ?? ""}
            placeholder="Routine cybercrime, unrelated sectors, periods outside the study window…"
          />
        </label>
      </section>

      <section className="space-y-4 pt-3">
        <SectionHeading
          eyebrow="Working direction"
          title="Questions, knowledge, and gaps"
          description="These are lightweight working lists, not mandatory gates. Enter one item per line."
        />

        <label className="block text-sm text-stone-300">
          Supporting intelligence questions
          <textarea
            className="field mt-1.5 min-h-32"
            name="supporting_questions"
            defaultValue={formatLineList(project.supporting_questions)}
            placeholder={"When did precursor activity begin?\nDoes the activity recur across incidents?"}
          />
        </label>

        <div className="grid gap-4 lg:grid-cols-2">
          <label className="block text-sm text-stone-300">
            Current knowledge
            <textarea
              className="field mt-1.5 min-h-36"
              name="current_knowledge"
              defaultValue={formatLineList(project.current_knowledge)}
              placeholder="What do we currently understand well enough to carry forward?"
            />
          </label>

          <label className="block text-sm text-stone-300">
            Information gaps
            <textarea
              className="field mt-1.5 min-h-36"
              name="information_gaps"
              defaultValue={formatLineList(project.information_gaps)}
              placeholder="What must still be learned to answer the primary question?"
            />
          </label>
        </div>
      </section>

      <section className="space-y-4 pt-3">
        <SectionHeading
          eyebrow="Lifecycle"
          title="Investigation state"
          description="Existing lifecycle and assessment controls remain available without dominating the direction view."
        />

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <label className="block text-sm text-stone-300">
            Research type
            <select
              className="field mt-1.5"
              name="research_type"
              defaultValue={project.research_type ?? "CTI"}
            >
              {researchTypes.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>

          <label className="block text-sm text-stone-300">
            Priority
            <select
              className="field mt-1.5"
              name="priority"
              defaultValue={project.priority ?? "MEDIUM"}
            >
              {priorities.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>

          <label className="block text-sm text-stone-300">
            Investigation status
            <select
              className="field mt-1.5"
              name="investigation_status"
              defaultValue={project.investigation_status ?? "DRAFT"}
            >
              {investigationStatuses.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="block text-sm text-stone-300">
          Background / description
          <textarea
            className="field mt-1.5 min-h-24"
            name="description"
            maxLength={2000}
            defaultValue={project.description ?? ""}
          />
        </label>

        <div className="grid gap-4 lg:grid-cols-2">
          <label className="block text-sm text-stone-300">
            Current assessment
            <textarea
              className="field mt-1.5 min-h-32"
              name="current_assessment"
              maxLength={10000}
              defaultValue={project.current_assessment ?? ""}
            />
            <FieldHint>The analyst’s present conclusion; keep it distinct from the working knowledge list.</FieldHint>
          </label>

          <div className="space-y-4">
            <label className="block text-sm text-stone-300">
              Assessment confidence
              <select
                className="field mt-1.5"
                name="assessment_confidence"
                defaultValue={project.assessment_confidence ?? ""}
              >
                <option value="">Not assessed</option>
                {assessmentConfidenceLevels.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>

            <label className="block text-sm text-stone-300">
              Tags
              <input
                className="field mt-1.5"
                name="tags"
                placeholder="phishing, energy, infrastructure"
                defaultValue={project.tags?.join(", ") ?? ""}
              />
            </label>

            <label className="block text-sm text-stone-300">
              Closed date
              <input
                className="field mt-1.5"
                name="closed_at"
                type="date"
                defaultValue={formatProjectDateInput(project.closed_at)}
              />
            </label>
          </div>
        </div>
      </section>

      <div className="flex justify-end border-t border-amber-900/20 pt-4">
        <SubmitButton>Save investigation</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function ProjectForm({ action, project }: ProjectFormProps) {
  const editing = Boolean(project?.id);

  if (!editing) return <CreateInvestigationForm action={action} />;

  return (
    <>
      {project?.id ? <InvestigationSummary project={project as Project} /> : null}

      <details className="group rounded border border-amber-900/25 bg-black/10">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 text-sm font-semibold text-stone-200 hover:bg-amber-950/10">
          <span>
            <span className="citem-label mr-3">Edit</span>
            Direction, scope & lifecycle
          </span>
          <span className="text-xs font-normal text-stone-500 group-open:hidden">Open editor</span>
          <span className="hidden text-xs font-normal text-amber-300 group-open:inline">Close editor</span>
        </summary>
        <div className="border-t border-amber-900/20 p-4 sm:p-5">
          <EditInvestigationForm action={action} project={project} />
        </div>
      </details>
    </>
  );
}
