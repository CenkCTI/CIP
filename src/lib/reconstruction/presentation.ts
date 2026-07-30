export type MembershipStatus = "POSSIBLE" | "CONFIRMED" | "REJECTED" | "REMOVED";
type Row = Record<string, unknown>;

export function timelineDeletionMessage(statuses: string[]) {
  if (statuses.some((status) => status === "POSSIBLE" || status === "CONFIRMED")) {
    return "Reject or remove active Campaign memberships before deleting this Timeline event.";
  }
  if (statuses.length) {
    return "Explicitly unlink rejected or removed Campaign history before deleting this Timeline event.";
  }
  return null;
}

export function visibleCampaignActivity(rows: Row[], includeHistorical: boolean) {
  return rows
    .filter((row) => {
      const event = row.timeline_events as Row | undefined;
      return includeHistorical || (
        ["POSSIBLE", "CONFIRMED"].includes(String(row.status))
        && String(event?.assessment_status) !== "RETRACTED"
      );
    })
    .sort((left, right) => {
      const leftEvent = left.timeline_events as Row | undefined;
      const rightEvent = right.timeline_events as Row | undefined;
      const timeOrder = String(leftEvent?.event_date ?? "").localeCompare(String(rightEvent?.event_date ?? ""));
      if (timeOrder) return timeOrder;
      const sequenceOrder = Number(left.sequence_order ?? Number.MAX_SAFE_INTEGER)
        - Number(right.sequence_order ?? Number.MAX_SAFE_INTEGER);
      return sequenceOrder || String(left.id).localeCompare(String(right.id));
    });
}

export function validTimelineDate(value?: string) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value))
    ? value
    : undefined;
}
