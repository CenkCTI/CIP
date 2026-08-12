#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const EPSS_LIMIT = 2500;

function numeric(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Number.NEGATIVE_INFINITY;
}

export function canonicalizeNode2gShadowSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    throw new Error("NODE-2G shadow export must be a JSON object.");
  }
  if (!Array.isArray(snapshot.records)) {
    throw new Error("NODE-2G shadow export must contain a records array.");
  }
  if (snapshot.sourceKey !== "FIRST_EPSS") return snapshot;

  const ranked = [...snapshot.records]
    .sort((left, right) => {
      const scoreDelta = numeric(right?.facts?.score) - numeric(left?.facts?.score);
      if (scoreDelta !== 0) return scoreDelta;
      const percentileDelta = numeric(right?.facts?.percentile) - numeric(left?.facts?.percentile);
      if (percentileDelta !== 0) return percentileDelta;
      return String(left?.sourceRecordId ?? "").localeCompare(String(right?.sourceRecordId ?? ""));
    })
    .slice(0, EPSS_LIMIT)
    .sort((left, right) => String(left.sourceRecordId).localeCompare(String(right.sourceRecordId)));

  return { ...snapshot, records: ranked };
}

function runRawExporter(args) {
  const rawExporter = fileURLToPath(new URL("./node2g-shadow-export.mjs", import.meta.url));
  const result = spawnSync(process.execPath, [rawExporter, ...args], {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (result.stderr) process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }
  return JSON.parse(result.stdout);
}

const isMain = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const snapshot = runRawExporter(process.argv.slice(2));
  const canonical = canonicalizeNode2gShadowSnapshot(snapshot);
  process.stdout.write(`${JSON.stringify(canonical, null, 2)}\n`);
}
