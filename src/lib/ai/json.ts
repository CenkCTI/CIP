import { z } from "zod";
export function extractOneJsonObject(text: string) {
  const trimmed = text.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("malformed_output");
  const candidate = trimmed.slice(start, end + 1);
  let depth = 0, inString = false, escaped = false;
  for (let i = 0; i < candidate.length; i++) {
    const c = candidate[i];
    if (escaped) { escaped = false; continue; }
    if (c === "\\") { escaped = true; continue; }
    if (c === '"') inString = !inString;
    if (!inString && c === "{") depth++;
    if (!inString && c === "}") depth--;
    if (depth === 0 && i !== candidate.length - 1) throw new Error("multiple_json_objects");
  }
  if (depth !== 0 || inString) throw new Error("malformed_output");
  return JSON.parse(candidate) as unknown;
}
export function parseAiJson<T>(text: string, schema: z.ZodType<T>) {
  return schema.parse(extractOneJsonObject(text));
}
