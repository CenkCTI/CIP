import { z } from "zod";

export const globalRangeSchema = z.enum(["24h", "7d", "30d"]);
export type GlobalRange = z.infer<typeof globalRangeSchema>;

export function resolveGlobalRange(range: GlobalRange, now = new Date()) {
  const to = now.toISOString();
  const milliseconds = range === "24h" ? 86_400_000 : range === "7d" ? 7 * 86_400_000 : 30 * 86_400_000;
  return { from: new Date(now.getTime() - milliseconds).toISOString(), to };
}
