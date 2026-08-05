import type { IndicatorType } from "./types";
export function normalizeCveId(value: string) { const v = value.trim().toUpperCase(); if (!/^CVE-\d{4}-\d{4,}$/.test(v)) throw new Error("invalid_cve"); return v; }
export function normalizeAttackId(value: string) { const v = value.trim().toUpperCase(); if (!/^T\d{4}(\.\d{3})?$/.test(v)) throw new Error("invalid_attack_id"); return v; }
export function normalizeWhitespace(value: string) { return value.trim().replace(/\s+/g, " "); }
export function normalizeIndicatorValue(type: IndicatorType, value: string) { const v = value.trim(); if (type === "URL") { const u = new URL(v); if (!["http:", "https:"].includes(u.protocol) || u.username || u.password) throw new Error("invalid_url_indicator"); u.protocol = u.protocol.toLowerCase(); u.hostname = u.hostname.toLowerCase(); return u.toString(); } if (type === "DOMAIN" || type === "HASH" || type === "EMAIL") return v.toLowerCase(); return v; }
export const vulnerabilityCanonicalKey = (cveId: string) => `cve:${normalizeCveId(cveId)}`;
export const indicatorCanonicalKey = (type: IndicatorType, value: string) => `indicator:${type}:${normalizeIndicatorValue(type, value)}`;
export const attackCanonicalKey = (attackId: string) => `attack:${normalizeAttackId(attackId)}`;
export const reportCanonicalKey = (sourceSystem: string, sourceRecordKey: string) => `report:${normalizeWhitespace(sourceSystem).toLowerCase()}:${normalizeWhitespace(sourceRecordKey)}`;
export const advisoryCanonicalKey = (vendorOrSource: string, sourceRecordKey: string) => `advisory:${normalizeWhitespace(vendorOrSource).toLowerCase()}:${normalizeWhitespace(sourceRecordKey)}`;
