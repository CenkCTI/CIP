import {
  detectIndicatorType,
  validateObservedIndicator,
  type BulkDetectedIndicatorType,
} from "@/lib/cti/indicators";

export type ExtractedIndicatorCandidate = {
  observedValue: string;
  canonicalValue: string;
  type: BulkDetectedIndicatorType;
};

const candidatePatterns = [
  /\b(?:hxxps?|https?):\/\/[^\s<>"'()]+/gi,
  /\b[^\s@]+@(?:[a-z0-9-]+\.)+[a-z]{2,63}\b/gi,
  /\b[a-f0-9]{64}\b/gi,
  /\b[a-f0-9]{40}\b/gi,
  /\b[a-f0-9]{32}\b/gi,
  /\b(?:\d{1,3}\.){3}\d{1,3}(?:\/\d{1,2})?\b/g,
  /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\[\.\])+(?:[a-z]{2,63})\b/gi,
  /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}\b/gi,
] as const;

function trimTrailing(value: string) {
  return value.replace(/[.,;:!?]+$/g, "");
}

export function extractIndicatorCandidatesFromText(
  input: string,
  limit = 100,
): ExtractedIndicatorCandidate[] {
  const found: Array<{ value: string; index: number }> = [];
  for (const pattern of candidatePatterns) {
    for (const match of input.matchAll(pattern)) {
      if (match.index == null) continue;
      found.push({ value: trimTrailing(match[0]), index: match.index });
    }
  }

  found.sort((a, b) => a.index - b.index || b.value.length - a.value.length);
  const out: ExtractedIndicatorCandidate[] = [];
  const seen = new Set<string>();

  for (const item of found) {
    const type = detectIndicatorType(item.value);
    if (!type) continue;
    const checked = validateObservedIndicator({ value: item.value, type });
    if (!checked.valid) continue;
    const key = `${type}:${checked.canonical}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      observedValue: item.value,
      canonicalValue: checked.canonical,
      type,
    });
    if (out.length >= limit) break;
  }
  return out;
}
