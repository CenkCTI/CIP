#!/usr/bin/env node
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const sentinel = process.env.CITEM_NODE8_SECRET_SENTINEL;
if (!sentinel || sentinel.length < 24) throw new Error("CITEM_NODE8_SECRET_SENTINEL (24+ chars) is required");
const root = path.resolve(".next/static");
async function files(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await files(target)); else result.push(target);
  }
  return result;
}
const paths = await files(root);
for (const file of paths) if ((await readFile(file)).includes(Buffer.from(sentinel))) throw new Error(`Node credential sentinel leaked into browser artifact: ${path.relative(root, file)}`);
process.stdout.write(`PASS: scanned ${paths.length} browser/static artifacts; Node credential sentinel absent.\n`);
