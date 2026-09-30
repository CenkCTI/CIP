export type TimelineRow = Record<string, unknown>;

const text = (value: unknown) => String(value ?? "");

export function timelineTimeLabel(row: TimelineRow) {
  const start = new Date(text(row.event_date));
  const end = row.occurred_end_at ? new Date(text(row.occurred_end_at)) : null;
  const precision = text(row.time_precision) || "EXACT";
  const explicit = text(row.time_label).trim();

  if (precision === "APPROXIMATE" && explicit) return explicit;
  if (precision === "YEAR" && !Number.isNaN(start.getTime())) {
    return new Intl.DateTimeFormat("en", { year: "numeric", timeZone: "UTC" }).format(start);
  }
  if (precision === "MONTH" && !Number.isNaN(start.getTime())) {
    return new Intl.DateTimeFormat("en", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(start);
  }
  if (precision === "DAY" && !Number.isNaN(start.getTime())) {
    return new Intl.DateTimeFormat("en", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(start);
  }
  if (precision === "RANGE" && !Number.isNaN(start.getTime()) && end && !Number.isNaN(end.getTime())) {
    const formatter = new Intl.DateTimeFormat("en", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
    return explicit || `${formatter.format(start)} – ${formatter.format(end)}`;
  }
  if (!Number.isNaN(start.getTime())) {
    const first = start.toLocaleString();
    if (end && !Number.isNaN(end.getTime())) return `${first} → ${end.toLocaleString()}`;
    return first;
  }
  return explicit || "Time not specified";
}

export function timelinePhaseLabel(value: unknown) {
  return text(value || "UNKNOWN").replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export function defaultTimelineEntityRole(type: string) {
  if (type === "infrastructure_cluster") return "INFRASTRUCTURE";
  if (type === "malware") return "PAYLOAD";
  if (type === "cve") return "VULNERABILITY";
  if (type === "mitre_technique") return "TECHNIQUE";
  return "SUPPORTING_ARTIFACT";
}

export function annotationPageLabel(annotation: TimelineRow, fragments: TimelineRow[] = []) {
  const pages = [...new Set(
    fragments
      .filter((fragment) => text(fragment.annotation_id) === text(annotation.id))
      .map((fragment) => Number(fragment.page_number))
      .filter((page) => Number.isInteger(page) && page > 0),
  )].sort((a, b) => a - b);
  if (pages.length === 1) return `Page ${pages[0]}`;
  if (pages.length > 1) return `Pages ${pages.join(", ")}`;
  return annotation.page_number ? `Page ${text(annotation.page_number)}` : "Source annotation";
}
