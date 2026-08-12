import { createHash } from "node:crypto";
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const SOURCE_KEYS = ["CISA_KEV", "NVD_CVE", "FIRST_EPSS", "THREATFOX", "MALWAREBAZAAR"];
const CUTOVER_ADMITTED_STATUSES = new Set(["ENABLED", "PAUSED"]);

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function sha256Json(value) {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

function parseArgs(argv) {
  const out = { mode: "dry-run", snapshot: null, source: null };
  for (const arg of argv) {
    if (arg === "--dry-run") out.mode = "dry-run";
    else if (arg === "--pause") out.mode = "pause";
    else if (arg === "--rollback") out.mode = "rollback";
    else if (arg.startsWith("--snapshot=")) out.snapshot = arg.slice("--snapshot=".length);
    else if (arg.startsWith("--source=")) out.source = arg.slice("--source=".length);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (out.source && !SOURCE_KEYS.includes(out.source)) throw new Error(`Unsupported source: ${out.source}`);
  return out;
}

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

async function fetchConnections(db) {
  let query = db.from("technical_source_connections").select(
    "id,owner_id,source_key,status,cursor,cursor_version,interval_minutes,next_run_at,last_started_at,last_succeeded_at,last_failed_at,consecutive_failures",
  ).in("source_key", SOURCE_KEYS).order("source_key");
  if (process.env.CITEM_OWNER_ID) query = query.eq("owner_id", process.env.CITEM_OWNER_ID);
  const { data, error } = await query;
  if (error) throw new Error(`CUTOVER_CONNECTION_READ_FAILED:${error.code ?? "UNKNOWN"}`);
  const rows = data ?? [];
  const owners = [...new Set(rows.map((row) => row.owner_id))];
  if (!process.env.CITEM_OWNER_ID && owners.length !== 1) {
    throw new Error("CITEM_OWNER_ID is required when zero or multiple owners have admitted source connections");
  }
  const ownerId = process.env.CITEM_OWNER_ID ?? owners[0];
  const selected = rows.filter((row) => row.owner_id === ownerId);
  const byKey = new Map(selected.map((row) => [row.source_key, row]));
  for (const key of SOURCE_KEYS) {
    if (!byKey.has(key)) throw new Error(`Missing CITEM source connection: ${key}`);
  }
  const ordered = SOURCE_KEYS.map((key) => byKey.get(key));
  for (const row of ordered) {
    if (!CUTOVER_ADMITTED_STATUSES.has(row.status)) {
      throw new Error(`CUTOVER_UNSUPPORTED_PRE_STATUS:${row.source_key}:${row.status}`);
    }
  }
  return { ownerId, rows: ordered };
}

async function runningRuns(db, connectionIds) {
  const { data, error } = await db.from("technical_collection_runs")
    .select("id,connection_id,source_key,started_at,lease_expires_at")
    .in("connection_id", connectionIds)
    .eq("status", "RUNNING");
  if (error) throw new Error(`CUTOVER_RUNNING_READ_FAILED:${error.code ?? "UNKNOWN"}`);
  return data ?? [];
}

async function historyCounts(db, ownerId) {
  const counts = {};
  for (const key of SOURCE_KEYS) {
    const { count, error } = await db.from("technical_collection_runs")
      .select("id", { head: true, count: "exact" })
      .eq("owner_id", ownerId)
      .eq("source_key", key);
    if (error) throw new Error(`CUTOVER_HISTORY_COUNT_FAILED:${key}:${error.code ?? "UNKNOWN"}`);
    counts[key] = count ?? 0;
  }
  return counts;
}

function snapshotPayload(ownerId, rows, counts) {
  return {
    schemaVersion: "CITEM_NODE2_CUTOVER_SNAPSHOT_V1",
    capturedAt: new Date().toISOString(),
    ownerId,
    sources: rows.map((row) => ({
      connectionId: row.id,
      sourceKey: row.source_key,
      status: row.status,
      cursor: row.cursor,
      cursorVersion: row.cursor_version,
      cursorSha256: sha256Json(row.cursor),
      intervalMinutes: row.interval_minutes,
      nextRunAt: row.next_run_at,
      lastStartedAt: row.last_started_at,
      lastSucceededAt: row.last_succeeded_at,
      lastFailedAt: row.last_failed_at,
      consecutiveFailures: row.consecutive_failures,
      runHistoryCount: counts[row.source_key] ?? 0,
    })),
  };
}

function safeSummary(snapshot) {
  return snapshot.sources.map(({ sourceKey, connectionId, status, cursorVersion, cursorSha256, runHistoryCount }) => ({
    sourceKey,
    connectionId,
    status,
    cursorVersion,
    cursorSha256,
    runHistoryCount,
  }));
}

async function setStatus(db, ownerId, connectionId, status) {
  const { data, error } = await db.rpc("set_technical_source_status", {
    p_actor: ownerId,
    p_connection_id: connectionId,
    p_status: status,
  });
  if (error) throw new Error(`CUTOVER_STATUS_CHANGE_FAILED:${error.code ?? "UNKNOWN"}`);
  if (data !== status) throw new Error(`CUTOVER_STATUS_CHANGE_UNEXPECTED:${String(data)}`);
}

async function verifyPreserved(db, before, expectedStatus) {
  const { ownerId, rows } = await fetchConnections(db);
  if (ownerId !== before.ownerId) throw new Error("CUTOVER_OWNER_CHANGED");
  const counts = await historyCounts(db, ownerId);
  const byKey = new Map(rows.map((row) => [row.source_key, row]));
  for (const previous of before.sources) {
    const current = byKey.get(previous.sourceKey);
    if (!current) throw new Error(`CUTOVER_CONNECTION_DISAPPEARED:${previous.sourceKey}`);
    if (current.status !== expectedStatus) throw new Error(`CUTOVER_STATUS_VERIFY_FAILED:${previous.sourceKey}`);
    if (sha256Json(current.cursor) !== previous.cursorSha256) throw new Error(`CUTOVER_CURSOR_CHANGED:${previous.sourceKey}`);
    if ((counts[previous.sourceKey] ?? 0) !== previous.runHistoryCount) throw new Error(`CUTOVER_HISTORY_CHANGED:${previous.sourceKey}`);
  }
}

function printRunning(label, runs) {
  console.error(JSON.stringify({
    label,
    running: runs.map(({ source_key, id, started_at, lease_expires_at }) => ({
      sourceKey: source_key,
      runId: id,
      startedAt: started_at,
      leaseExpiresAt: lease_expires_at,
    })),
  }, null, 2));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const db = client();

  if (args.mode === "rollback") {
    if (process.env.NODE2G_ROLLBACK_CONFIRMED !== "true") {
      throw new Error("Rollback requires NODE2G_ROLLBACK_CONFIRMED=true after the Node source has been disabled and drained");
    }
    if (!args.snapshot) throw new Error("Rollback requires --snapshot=<pre-cutover-json>");
    const before = JSON.parse(fs.readFileSync(args.snapshot, "utf8"));
    if (before.schemaVersion !== "CITEM_NODE2_CUTOVER_SNAPSHOT_V1") throw new Error("Unsupported cutover snapshot");
    const selected = args.source ? before.sources.filter((item) => item.sourceKey === args.source) : before.sources;
    if (selected.length === 0) throw new Error("No rollback sources selected");
    for (const previous of selected) {
      if (!CUTOVER_ADMITTED_STATUSES.has(previous.status)) {
        throw new Error(`ROLLBACK_UNSUPPORTED_PRE_STATUS:${previous.sourceKey}:${previous.status}`);
      }
    }
    const { ownerId, rows } = await fetchConnections(db);
    if (ownerId !== before.ownerId) throw new Error("CUTOVER_OWNER_CHANGED");
    const currentByKey = new Map(rows.map((row) => [row.source_key, row]));
    for (const previous of selected) {
      const current = currentByKey.get(previous.sourceKey);
      if (!current) throw new Error(`CUTOVER_CONNECTION_DISAPPEARED:${previous.sourceKey}`);
      if (current.status !== "PAUSED") throw new Error(`ROLLBACK_REQUIRES_PAUSED_CITEM_SOURCE:${previous.sourceKey}:${current.status}`);
      if (sha256Json(current.cursor) !== previous.cursorSha256) throw new Error(`ROLLBACK_CURSOR_CHANGED:${previous.sourceKey}`);
      if (previous.status === "ENABLED") await setStatus(db, ownerId, current.id, "ENABLED");
    }
    console.log(JSON.stringify({
      mode: "rollback",
      automaticFailback: false,
      sources: selected.map((item) => ({ sourceKey: item.sourceKey, restoredStatus: item.status })),
    }, null, 2));
    return;
  }

  const { ownerId, rows } = await fetchConnections(db);
  const connectionIds = rows.map((row) => row.id);
  const running = await runningRuns(db, connectionIds);
  if (running.length > 0) {
    printRunning("pre-pause", running);
    throw new Error("CUTOVER_BLOCKED_ACTIVE_CITEM_RUNS");
  }
  const counts = await historyCounts(db, ownerId);
  const snapshot = snapshotPayload(ownerId, rows, counts);
  const snapshotPath = args.snapshot ?? `/tmp/citem-node2g-cutover-${Date.now()}.json`;
  fs.writeFileSync(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, { mode: 0o600 });

  if (args.mode === "dry-run") {
    console.log(JSON.stringify({ mode: "dry-run", snapshotPath, runningRuns: 0, sources: safeSummary(snapshot) }, null, 2));
    return;
  }

  for (const row of rows) {
    if (row.status === "ENABLED") await setStatus(db, ownerId, row.id, "PAUSED");
  }

  const postPauseRunning = await runningRuns(db, connectionIds);
  if (postPauseRunning.length > 0) {
    printRunning("post-pause", postPauseRunning);
    throw new Error("CUTOVER_BLOCKED_POST_PAUSE_ACTIVE_CITEM_RUNS");
  }

  await verifyPreserved(db, snapshot, "PAUSED");
  console.log(JSON.stringify({
    mode: "pause",
    snapshotPath,
    runningRuns: 0,
    cursorHistoryPreserved: true,
    automaticFailback: false,
    sources: safeSummary({ ...snapshot, sources: snapshot.sources.map((item) => ({ ...item, status: "PAUSED" })) }),
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});