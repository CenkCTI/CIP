import {
  addIntelProfileItem,
  refreshInvestigationIntelProfile,
  setIntelProfileItemState,
  setIntelProfileStatus,
  updateIntelProfile,
} from "@/app/techint/actions";
import {
  intelProfileItemKinds,
  intelProfileSemanticRoles,
  type IntelProfile,
  type IntelProfileItem,
} from "@/lib/techint/schema";

import { IntelProfileForm } from "./profile-form";

type AuditEvent = { id: string; action: string; created_at: string };
type Action = (formData: FormData) => void | Promise<void>;
const asFormAction = (action: unknown) => action as Action;

export function IntelProfileDetail({
  profile,
  items,
  audit,
  investigation,
}: {
  profile: IntelProfile;
  items: IntelProfileItem[];
  audit: AuditEvent[];
  investigation?: boolean;
}) {
  const active = items.filter((item) => item.state === "ACTIVE");
  const pending = items.filter((item) => item.state === "PENDING");
  const inactive = items.filter((item) => !["ACTIVE", "PENDING"].includes(item.state));

  return (
    <section className="space-y-5">
      <div className="card">
        <p className="citem-eyebrow">
          {profile.kind} / {profile.status}
        </p>
        <h1 className="citem-title">{profile.name}</h1>
        <p className="mt-2 text-sm text-stone-400">
          This profile defines what future TechINT matching should monitor
          {investigation ? " for this Investigation" : ""}. Matching and technical signal
          collection are not active in Phase 2.3A.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <form
            action={asFormAction(setIntelProfileStatus.bind(
              null,
              profile.id,
              profile.status === "PAUSED" ? "ACTIVE" : "PAUSED",
              false,
            ))}
          >
            <button className="citem-button-ghost">
              {profile.status === "PAUSED" ? "Resume" : "Pause"}
            </button>
          </form>
          <form action={asFormAction(setIntelProfileStatus.bind(null, profile.id, "ARCHIVED", false))}>
            <button className="citem-button-ghost">Archive</button>
          </form>
          {profile.status === "ARCHIVED" && (
            <form action={asFormAction(setIntelProfileStatus.bind(null, profile.id, "PAUSED", true))}>
              <button className="citem-button-ghost">Restore paused</button>
            </form>
          )}
          {investigation && profile.project_id && (
            <form
              action={asFormAction(refreshInvestigationIntelProfile.bind(
                null,
                profile.id,
                profile.project_id,
              ))}
            >
              <button className="citem-button">Refresh from Investigation</button>
            </form>
          )}
        </div>
      </div>

      <IntelProfileForm profile={profile} action={updateIntelProfile.bind(null, profile.id)} />

      <div className="card">
        <h2 className="citem-section-title">Add explicit item</h2>
        <form action={asFormAction(addIntelProfileItem.bind(null, profile.id))} className="mt-3 grid gap-3 md:grid-cols-4">
          <select className="field" name="kind">
            {intelProfileItemKinds.map((kind) => (
              <option key={kind}>{kind}</option>
            ))}
          </select>
          <input className="field md:col-span-2" name="display_value" placeholder="Display value" required />
          <select className="field" name="semantic_role">
            <option value="">Semantic role if location</option>
            {intelProfileSemanticRoles.map((role) => (
              <option key={role}>{role}</option>
            ))}
          </select>
          <button className="citem-button md:col-span-4">Add active explicit item</button>
        </form>
      </div>

      <ItemTable title="Items" items={active} profileId={profile.id} />
      <ItemTable title="Pending Suggestions" items={pending} profileId={profile.id} />
      <ItemTable title="Excluded / Removed" items={inactive} profileId={profile.id} />

      <div className="card">
        <h2 className="citem-section-title">History</h2>
        <ul className="mt-3 space-y-2 text-sm text-stone-400">
          {audit.map((event) => (
            <li key={event.id}>
              {event.action} · {new Date(event.created_at).toLocaleString()}
            </li>
          ))}
          {!audit.length && <li>No audit events yet.</li>}
        </ul>
      </div>
    </section>
  );
}

function ItemTable({
  title,
  items,
  profileId,
}: {
  title: string;
  items: IntelProfileItem[];
  profileId: string;
}) {
  return (
    <div className="card">
      <h2 className="citem-section-title">{title}</h2>
      {!items.length ? (
        <p className="mt-2 text-sm text-stone-500">No records in this section.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-stone-500">
              <tr>
                <th>Kind</th>
                <th>Value</th>
                <th>Origin</th>
                <th>State</th>
                <th>Semantic role</th>
                <th>Source</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t border-stone-800">
                  <td className="py-2">{item.kind}</td>
                  <td>{item.display_value}</td>
                  <td>{item.origin}</td>
                  <td>{item.state}</td>
                  <td>{item.semantic_role ?? "—"}</td>
                  <td>{item.source_entity_type ?? "—"}</td>
                  <td className="flex gap-1 py-1">
                    {item.state === "PENDING" && (
                      <form action={asFormAction(setIntelProfileItemState.bind(null, profileId, item.id, "ACTIVE"))}>
                        <button className="citem-button-ghost">Accept</button>
                      </form>
                    )}
                    {!["EXCLUDED", "REMOVED"].includes(item.state) && (
                      <form action={asFormAction(setIntelProfileItemState.bind(null, profileId, item.id, "EXCLUDED"))}>
                        <button className="citem-button-ghost">Exclude</button>
                      </form>
                    )}
                    {item.state !== "REMOVED" && (
                      <form action={asFormAction(setIntelProfileItemState.bind(null, profileId, item.id, "REMOVED"))}>
                        <button className="citem-button-ghost">Remove</button>
                      </form>
                    )}
                    {["EXCLUDED", "REMOVED"].includes(item.state) && (
                      <form action={asFormAction(setIntelProfileItemState.bind(null, profileId, item.id, "ACTIVE"))}>
                        <button className="citem-button-ghost">Reactivate</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
