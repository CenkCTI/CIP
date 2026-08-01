import ipaddr from "ipaddr.js";
import { ZodError } from "zod";
import { normalizeProviderItem } from "../../normalize";
import type { ProviderSkipReason } from "../../types";
import { threatFoxItemSchema } from "./schema";

export class ThreatFoxMappingError extends Error {
  constructor(public readonly reason: ProviderSkipReason) {
    super(reason);
    this.name = "ThreatFoxMappingError";
  }
  toJSON() { return { reason: this.reason }; }
}

const threatFoxUtc = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2}) UTC$/;
const isoUtc = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const isoOffset = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/;

export function parseThreatFoxDate(value: string | null | undefined, required = false): string | null {
  if (value == null) {
    if (required) throw new ThreatFoxMappingError("INVALID_DATE");
    return null;
  }
  let normalized = value;
  const match = threatFoxUtc.exec(value);
  if (match) normalized = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z`;
  else if (!isoUtc.test(value) && !isoOffset.test(value)) throw new ThreatFoxMappingError("INVALID_DATE");
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(normalized);
  if (!parts) throw new ThreatFoxMappingError("INVALID_DATE");
  const [, year, month, day, hour, minute, second] = parts;
  const calendar = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)));
  if (calendar.getUTCFullYear() !== Number(year) || calendar.getUTCMonth() + 1 !== Number(month) || calendar.getUTCDate() !== Number(day) || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) throw new ThreatFoxMappingError("INVALID_DATE");
  const offset = /([+-])(\d{2}):(\d{2})$/.exec(normalized);
  if (offset && (Number(offset[2]) > 23 || Number(offset[3]) > 59)) throw new ThreatFoxMappingError("INVALID_DATE");
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.valueOf())) throw new ThreatFoxMappingError("INVALID_DATE");
  if (match && parsed.toISOString() !== `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}.000Z`) throw new ThreatFoxMappingError("INVALID_DATE");
  return parsed.toISOString();
}

const safeUrl = (value: string | null | undefined) => {
  try {
    const parsed = new URL(value ?? "");
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.toString() : null;
  } catch { return null; }
};

export function mapThreatFoxItem(raw: unknown) {
  let item;
  try { item = threatFoxItemSchema.parse(raw); }
  catch (error) {
    if (error instanceof ZodError) throw new ThreatFoxMappingError("INVALID_PROVIDER_RECORD");
    throw error;
  }

  let type: "DOMAIN" | "IPV4" | "IPV6" | "URL";
  let value = item.ioc;
  if (item.ioc_type === "domain") type = "DOMAIN";
  else if (item.ioc_type === "url") type = "URL";
  else if (item.ioc_type === "ip:port") {
    const host = item.ioc.startsWith("[") ? /^\[([^\]]+)\]:(\d+)$/.exec(item.ioc) : /^(.+):(\d+)$/.exec(item.ioc);
    if (!host || !ipaddr.isValid(host[1])) throw new ThreatFoxMappingError("INVALID_IP");
    const port = Number(host[2]);
    if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new ThreatFoxMappingError("INVALID_PORT");
    type = ipaddr.parse(host[1]).kind() === "ipv4" ? "IPV4" : "IPV6";
    value = type === "IPV6" ? `[${host[1]}]:${host[2]}` : item.ioc;
  } else throw new ThreatFoxMappingError("UNSUPPORTED_IOC_TYPE");

  const confidence = typeof item.confidence_level === "string" ? Number(item.confidence_level) : item.confidence_level;
  if (confidence != null && (!Number.isInteger(confidence) || confidence < 0 || confidence > 100)) throw new ThreatFoxMappingError("INVALID_CONFIDENCE");
  const firstSeen = parseThreatFoxDate(item.first_seen, true);
  const lastSeen = parseThreatFoxDate(item.last_seen);
  if (firstSeen && lastSeen && Date.parse(lastSeen) < Date.parse(firstSeen)) throw new ThreatFoxMappingError("INVALID_DATE_ORDER");
  try {
    return normalizeProviderItem({
      providerKey: "THREATFOX", providerItemId: item.id, type, value,
      provider_reference_url: safeUrl(item.reference), threat_type: item.threat_type ?? null,
      malware_family: item.malware_printable || item.malware || null, confidence_score: confidence ?? null,
      first_seen_at: firstSeen, last_seen_at: lastSeen,
      tags: Array.from(new Set(["THREATFOX", ...(item.tags ?? []).slice(0, 49)])),
      metadata: { ioc_type: item.ioc_type, ioc_type_desc: item.ioc_type_desc ?? null, threat_type_desc: item.threat_type_desc ?? null, malware: item.malware ?? null, malware_printable: item.malware_printable ?? null, malware_alias: item.malware_alias ?? null, malware_malpedia: safeUrl(item.malware_malpedia), reporter: item.reporter ?? null },
    });
  } catch (error) {
    if (error instanceof ThreatFoxMappingError) throw error;
    if (error instanceof Error && error.message === "INVALID_CANDIDATE_VALUE") throw new ThreatFoxMappingError("INVALID_IOC");
    throw error;
  }
}
