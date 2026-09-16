#!/usr/bin/env node
import { readFile, readdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REAL_SCHEMA = "CITEM_NODE8_CUTOVER_EVIDENCE_V1";
const CONTRACT_SCHEMA = "CITEM_NODE8_CUTOVER_CONTRACT_V1";
const digestPattern = /^[a-z0-9./_-]+(?:@sha256:|:sha256:)[a-f0-9]{64}$/i;

function assert(condition, message) { if (!condition) throw new Error(message); }
async function commitSha() {
  if (process.env.CITEM_COMMIT_SHA) return process.env.CITEM_COMMIT_SHA;
  const head = (await readFile(path.join(root, ".git/HEAD"), "utf8")).trim();
  if (!head.startsWith("ref: ")) return head;
  const ref = head.slice(5);
  try { return (await readFile(path.join(root, ".git", ref), "utf8")).trim(); }
  catch {
    const packed = await readFile(path.join(root, ".git/packed-refs"), "utf8");
    const line = packed.split("\n").find(candidate => candidate.endsWith(` ${ref}`));
    assert(line, "unable to resolve CİTEM commit SHA");
    return line.slice(0, 40);
  }
}
async function source(relative) { return readFile(path.join(root, relative), "utf8"); }
async function sourceFiles(directory) {
  const result = [];
  for (const entry of await readdir(path.join(root, directory), { withFileTypes: true })) {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await sourceFiles(relative)); else if (/\.[cm]?[jt]sx?$/.test(entry.name)) result.push(relative);
  }
  return result;
}
async function staticChecks() {
  const [config, client, queries, degraded] = await Promise.all([
    source("src/lib/baykush-node/config.ts"), source("src/lib/baykush-node/client.ts"),
    source("src/lib/baykush-node/queries.ts"), source("src/components/techint/node-degraded-state.tsx"),
  ]);
  const browserFiles = [...await sourceFiles("src/app"), ...await sourceFiles("src/components")];
  const browserFacingSource = (await Promise.all(browserFiles.map(relative => source(relative)))).join("\n");
  return {
    tokenServerOnly: config.includes('import "server-only"') && client.includes('import "server-only"') && !queries.includes("BAYKUSH_NODE_API_TOKEN") && !browserFacingSource.includes("BAYKUSH_NODE_API_TOKEN") && !browserFacingSource.includes("NEXT_PUBLIC_NODE_API_TOKEN"),
    degradedUnknownBehavior: degraded.includes("DEGRADED") && degraded.includes("UNKNOWN") && degraded.includes("not zero"),
    canonicalMutationUnavailable: /method:\s*["']GET["']/.test(client) && !/method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/.test(client + queries),
  };
}
async function request(origin, pathname, token, timeoutMs) {
  assert(["/v1/sources", "/v1/techint/measurement-catalog", "/v1/ops/health"].includes(pathname), "request is outside the read-only acceptance allowlist");
  return fetch(`${origin}${pathname}`, { method: "GET", redirect: "manual", headers: { authorization: `Bearer ${token}`, accept: "application/json", "x-baykush-client": "CITEM-CUTOVER" }, signal: AbortSignal.timeout(timeoutMs) });
}
async function realEvidence() {
  assert(process.env.CITEM_NODE8_CUTOVER_CONFIRM === "YES", "real-host evidence requires CITEM_NODE8_CUTOVER_CONFIRM=YES");
  const url = new URL(process.env.BAYKUSH_NODE_BASE_URL ?? "");
  assert(url.protocol === "https:" && !["localhost", "127.0.0.1", "::1"].includes(url.hostname), "real-host evidence requires a non-local HTTPS Node origin");
  assert(url.pathname === "/" && !url.username && !url.password && !url.search && !url.hash, "Node URL must be a credential-free origin");
  const timeoutMs = Number(process.env.BAYKUSH_NODE_TIMEOUT_MS);
  assert(Number.isInteger(timeoutMs) && timeoutMs >= 1000 && timeoutMs <= 30000, "BAYKUSH_NODE_TIMEOUT_MS must be 1000..30000");
  const tokenFile = process.env.BAYKUSH_NODE_API_TOKEN_FILE;
  assert(tokenFile, "BAYKUSH_NODE_API_TOKEN_FILE is required; inline acceptance tokens are forbidden");
  const mode = (await stat(tokenFile)).mode & 0o777;
  assert((mode & 0o077) === 0, "token file must not be group/world accessible");
  const token = (await readFile(tokenFile, "utf8")).trim();
  assert(Buffer.byteLength(token) >= 32, "token file is invalid");
  const releaseDigest = process.env.BAYKUSH_NODE_RELEASE_DIGEST ?? "";
  assert(digestPattern.test(releaseDigest), "an exact digest-pinned Node release is required");
  const origin = url.origin;
  const invalidToken = `invalid-${"x".repeat(32)}`;
  const [sources, catalog, ops, invalid] = await Promise.all([
    request(origin, "/v1/sources", token, timeoutMs), request(origin, "/v1/techint/measurement-catalog", token, timeoutMs),
    request(origin, "/v1/ops/health", token, timeoutMs), request(origin, "/v1/sources", invalidToken, timeoutMs),
  ]);
  const [sourcesText, catalogText, opsText, invalidText] = await Promise.all([sources.text(), catalog.text(), ops.text(), invalid.text()]);
  const noReflection = ![sourcesText, catalogText, opsText, invalidText].some(value => value.includes(token) || value.includes(invalidToken));
  let sourcesJson, catalogJson;
  try { sourcesJson = JSON.parse(sourcesText); catalogJson = JSON.parse(catalogText); } catch { throw new Error("Node returned malformed JSON"); }
  const staticResult = await staticChecks();
  const checks = {
    serverToServerHttps: url.protocol === "https:", tokenServerOnly: staticResult.tokenServerOnly,
    restrictedScope: ops.status === 403, realNodeDataRead: sources.ok && Array.isArray(sourcesJson?.data) && catalog.ok && Array.isArray(catalogJson?.data),
    degradedUnknownBehavior: staticResult.degradedUnknownBehavior, canonicalMutationUnavailable: staticResult.canonicalMutationUnavailable,
    authenticationFailureSafe: invalid.status === 401 && noReflection, endToEndRead: sources.ok && catalog.ok,
  };
  return { schemaVersion: REAL_SCHEMA, evidenceClass: "REAL_PRODUCTION", timestamp: new Date().toISOString(), citemCommitSha: await commitSha(), nodeReleaseDigest: releaseDigest, nodeOrigin: origin, checks, result: Object.values(checks).every(Boolean) ? "PASS" : "FAIL" };
}
async function syntheticEvidence() {
  const checks = await staticChecks();
  return { schemaVersion: CONTRACT_SCHEMA, evidenceClass: "SYNTHETIC", limitations: ["CONTRACT_ONLY", "NOT_PRODUCTION_ACCEPTANCE"], timestamp: new Date().toISOString(), citemCommitSha: await commitSha(), supportedRealChecks: ["serverToServerHttps", "tokenServerOnly", "restrictedScope", "realNodeDataRead", "degradedUnknownBehavior", "canonicalMutationUnavailable", "authenticationFailureSafe", "endToEndRead"], checks, result: Object.values(checks).every(Boolean) ? "PASS" : "FAIL", productionStatus: "MANUAL_PENDING" };
}

export async function run(mode = process.argv.includes("--real") ? "real" : "synthetic") { return mode === "real" ? realEvidence() : syntheticEvidence(); }
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().then(result => { process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); if (result.result !== "PASS") process.exitCode = 1; }).catch(error => { process.stderr.write(`CİTEM cutover acceptance failed: ${error instanceof Error ? error.message : "unknown error"}\n`); process.exitCode = 1; });
}
