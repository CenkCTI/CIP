import type { ReactNode } from "react";

import { intelProfilePriorities, type IntelProfile } from "@/lib/techint/schema";

type IntelProfileAction = (formData: FormData) => unknown;

export function IntelProfileForm({
  action,
  profile,
}: {
  action: IntelProfileAction;
  profile?: Partial<IntelProfile>;
}) {
  return (
    <form action={action as (formData: FormData) => void | Promise<void>} className="card space-y-4">
      <Field label="Name">
        <input
          className="field"
          name="name"
          required
          minLength={2}
          maxLength={160}
          defaultValue={profile?.name}
        />
      </Field>
      <Field label="Description">
        <textarea
          className="field"
          name="description"
          maxLength={2000}
          defaultValue={profile?.description ?? ""}
        />
      </Field>
      <Field label="Intelligence question">
        <textarea
          className="field"
          name="intelligence_question"
          maxLength={2000}
          defaultValue={profile?.intelligence_question ?? ""}
        />
      </Field>
      <div className="grid gap-3 md:grid-cols-4">
        <Field label="Priority">
          <select className="field" name="priority" defaultValue={profile?.priority ?? "MEDIUM"}>
            {intelProfilePriorities.map((priority) => (
              <option key={priority}>{priority}</option>
            ))}
          </select>
        </Field>
        <Field label="Time horizon">
          <input
            className="field"
            type="number"
            name="time_horizon_days"
            min={1}
            max={730}
            defaultValue={profile?.time_horizon_days ?? 90}
          />
        </Field>
        <Field label="Minimum confidence">
          <input
            className="field"
            type="number"
            name="minimum_confidence"
            min={0}
            max={100}
            defaultValue={profile?.minimum_confidence ?? ""}
          />
        </Field>
        <Field label="Relationship depth">
          <input
            className="field"
            type="number"
            name="relationship_depth"
            min={0}
            max={3}
            defaultValue={profile?.relationship_depth ?? 1}
          />
        </Field>
      </div>
      <button className="citem-button" type="submit">
        Save Intel Profile
      </button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="citem-label mb-2 block">{label}</span>
      {children}
    </label>
  );
}
