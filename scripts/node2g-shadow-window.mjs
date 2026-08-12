const WINDOW_COLUMNS = Object.freeze({
  NVD_CVE: "source_modified_at",
  THREATFOX: "source_published_at",
});

export function shadowWindowColumn(sourceKey) {
  const column = WINDOW_COLUMNS[sourceKey];
  if (!column) {
    throw new Error(`Explicit shadow-export windows are not supported for ${sourceKey}`);
  }
  return column;
}

export function explicitShadowWindow(sourceKey, startRaw, endRaw) {
  const start = startRaw?.trim() || null;
  const end = endRaw?.trim() || null;
  if (!start && !end) return null;
  if (!start || !end) throw new Error("CİTEM shadow export requires both windowStart and windowEnd");
  shadowWindowColumn(sourceKey);

  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    throw new Error("Shadow-export window must contain valid datetimes");
  }
  if (startMs > endMs) {
    throw new Error("Shadow-export windowStart must not be after windowEnd");
  }

  return {
    start: new Date(startMs).toISOString(),
    end: new Date(endMs).toISOString(),
  };
}
