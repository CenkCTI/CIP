import { z } from "zod";
import { ThreatFoxError } from "./errors";

export const THREATFOX_CURSOR_MAX_BYTES = 1000;
export const THREATFOX_ID_MAX_DIGITS = 40;
const decimal = new RegExp(`^(0|[1-9]\\d{0,${THREATFOX_ID_MAX_DIGITS - 1}})$`);
const timestamp = z.string().datetime({ offset: true }).nullable();
const v2 = z.object({ schema_version: z.literal(2), provider: z.literal("THREATFOX"), max_id: z.string().regex(decimal), max_first_seen: timestamp }).strict();
const v1 = z.object({ schema_version: z.literal(1), max_id: z.union([z.number().int().safe().nonnegative(), z.string().regex(decimal), z.null()]), max_first_seen: timestamp }).strict();
export type ThreatFoxCursor = z.infer<typeof v2>;
function invalid(): never { throw new ThreatFoxError("THREATFOX_CURSOR_INVALID"); }
export function decimalProviderId(value: unknown): string | null { if (typeof value === "string" && decimal.test(value)) return value; if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return String(value); return null; }
export function parseThreatFoxCursor(value: string | null): ThreatFoxCursor | null { if (value === null) return null; if (Buffer.byteLength(value, "utf8") > THREATFOX_CURSOR_MAX_BYTES) invalid(); let parsed: unknown; try { parsed = JSON.parse(value); } catch { invalid(); } const current = v2.safeParse(parsed); if (current.success) return current.data; const legacy = v1.safeParse(parsed); if (!legacy.success || legacy.data.max_id === null) invalid(); return { schema_version: 2, provider: "THREATFOX", max_id: String(legacy.data.max_id), max_first_seen: legacy.data.max_first_seen }; }
export function serializeThreatFoxCursor(maxId: string, maxFirstSeen: string | null) { return JSON.stringify(v2.parse({ schema_version: 2, provider: "THREATFOX", max_id: maxId, max_first_seen: maxFirstSeen })); }
