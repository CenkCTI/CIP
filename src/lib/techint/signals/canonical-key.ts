import { normalizeIndicatorValue, validateIndicator, type IndicatorType } from "@/lib/cti/indicators";

const boundedPart = (value: string, label: string) => {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized || normalized.length > 300 || /[\u0000-\u001f]/.test(normalized)) throw new Error(`${label} is invalid.`);
  return normalized;
};

export function normalizeCve(value: string) {
  const normalized = value.trim().toUpperCase().replace(/^CVE(?=\d)/, "CVE-");
  if (!/^CVE-\d{4}-\d{4,}$/.test(normalized)) throw new Error("Invalid CVE ID.");
  return normalized;
}
export function vulnerabilityCanonicalKey(cve: string) { return `cve:${normalizeCve(cve)}`; }
export function indicatorCanonicalKey(type: IndicatorType, value: string) {
  const error = validateIndicator(value, type);
  if (error || ["FILE", "REGISTRY"].includes(type)) throw new Error(error ?? "Unsupported Indicator subtype.");
  return `indicator:${type}:${normalizeIndicatorValue(value, type)}`;
}
export function attackCanonicalKey(id: string) {
  const normalized = id.trim().toUpperCase();
  if (!/^T\d{4}(?:\.\d{3})?$/.test(normalized)) throw new Error("Invalid ATT&CK technique ID.");
  return `attack:${normalized}`;
}
export function reportCanonicalKey(sourceSystem: string, recordKey: string) { return `report:${boundedPart(sourceSystem, "source system").toLowerCase()}:${boundedPart(recordKey, "record key")}`; }
export function advisoryCanonicalKey(sourceSystem: string, recordKey: string) { return `advisory:${boundedPart(sourceSystem, "source system").toLowerCase()}:${boundedPart(recordKey, "record key")}`; }
