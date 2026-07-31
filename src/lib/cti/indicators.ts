import { z } from "zod";

export const indicatorTypes = [
  "IP",
  "CIDR",
  "DOMAIN",
  "URL",
  "HASH",
  "EMAIL",
  "FILE",
  "REGISTRY",
] as const;

export type IndicatorType = (typeof indicatorTypes)[number];
export type BulkDetectedIndicatorType = Exclude<IndicatorType, "FILE" | "REGISTRY">;
export type HashAlgorithm = "MD5" | "SHA-1" | "SHA-256";

export const MAX_BULK_IOC_LINES = 500;
export const MAX_BULK_IOC_INPUT_CHARS = 100_000;

export const bulkIocClassifications = [
  "NEW",
  "DUPLICATE_IN_INPUT",
  "ALREADY_EXISTS",
  "INVALID",
  "UNSUPPORTED_CVE",
] as const;

export type BulkIocClassification = (typeof bulkIocClassifications)[number];

export type ParsedBulkIocRow = {
  lineNumber: number;
  observedValue: string;
  detectedType: BulkDetectedIndicatorType | null;
  canonicalValue: string | null;
  defangedValue: string | null;
  hashAlgorithm: HashAlgorithm | null;
  valid: boolean;
  validationMessage: string | null;
  classification: BulkIocClassification;
  existingIndicatorId?: string;
};

export type ParsedBulkIoc = {
  rows: ParsedBulkIocRow[];
  nonEmptyLineCount: number;
};

const wrappingPunctuation = /^[<"'`(]+|[>"'`)]+$/g;
const defangedDot = /\[\.\]/gi;
const cvePattern = /^CVE-\d{4}-\d{4,}$/i;
const domainPattern = /^(?!-)([a-z0-9-]{1,63}\.)+[a-z]{2,63}$/i;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const hashPattern = /^(?:[a-f0-9]{32}|[a-f0-9]{40}|[a-f0-9]{64})$/i;

function stripConservativeWrapping(value: string) {
  return value.trim().replace(wrappingPunctuation, "");
}

function hasWhitespace(value: string) {
  return /\s/.test(value);
}

function splitUrlAuthority(rawUrl: string) {
  const schemeMatch = /^(hxxps?|https?):\/\//i.exec(rawUrl);
  if (!schemeMatch) return null;
  const rest = rawUrl.slice(schemeMatch[0].length);
  const firstPath = rest.search(/[/?#]/);
  const authority = firstPath === -1 ? rest : rest.slice(0, firstPath);
  const suffix = firstPath === -1 ? "" : rest.slice(firstPath);
  return {
    scheme: schemeMatch[1].toLowerCase(),
    authority,
    suffix,
  };
}

export function normalizeIndicatorValue(value: string, type: IndicatorType | string) {
  const trimmed = value.trim();
  if (type === "DOMAIN" || type === "EMAIL" || type === "HASH") {
    return trimmed.toLowerCase();
  }
  return trimmed;
}

export function safeRefangIndicatorValue(
  value: string,
  type: IndicatorType | string,
) {
  const candidate = stripConservativeWrapping(value);

  if (type === "DOMAIN") {
    if (!candidate || hasWhitespace(candidate) || /[/:?#@]/.test(candidate)) {
      return candidate;
    }
    return normalizeIndicatorValue(candidate.replace(defangedDot, "."), "DOMAIN");
  }

  if (type === "URL") {
    if (!candidate || hasWhitespace(candidate)) return candidate;
    const parts = splitUrlAuthority(candidate);
    if (!parts) return normalizeIndicatorValue(candidate, "URL");
    if (!parts.authority || parts.authority.includes("@")) return candidate;

    const scheme =
      parts.scheme === "hxxp"
        ? "http"
        : parts.scheme === "hxxps"
          ? "https"
          : parts.scheme;
    const authority = parts.authority.replace(defangedDot, ".");
    const hostOnly = authority.startsWith("[")
      ? authority
      : authority.split(":")[0];
    if (!hostOnly || hostOnly.endsWith(".") || hostOnly.includes("..")) {
      return candidate;
    }

    const normalized = `${scheme}://${authority}${parts.suffix}`;
    try {
      const parsed = new URL(normalized);
      if (parsed.username || parsed.password) return candidate;
      return normalized;
    } catch {
      return normalized;
    }
  }

  return normalizeIndicatorValue(candidate, type);
}

export function normalizeObservedIndicatorValue(
  value: string,
  type: IndicatorType | string,
) {
  return safeRefangIndicatorValue(value, type);
}

export function validateIndicator(value: string, type: IndicatorType | string) {
  const candidate = value.trim();
  if (!candidate) return "Indicator value is required.";

  if (type === "IP") {
    if (
      z.ipv4().safeParse(candidate).success ||
      z.ipv6().safeParse(candidate).success
    ) {
      return null;
    }
    return "Use a valid IPv4 or IPv6 address.";
  }

  if (type === "CIDR") {
    const [address, prefix, ...rest] = candidate.split("/");
    const parsed = z.union([z.ipv4(), z.ipv6()]).safeParse(address);
    const max = z.ipv4().safeParse(address).success ? 32 : 128;
    if (parsed.success && !rest.length && /^\d+$/.test(prefix ?? "") && Number(prefix) <= max) return null;
    return "Use a valid IPv4 or IPv6 CIDR range.";
  }

  if (type === "URL") {
    try {
      const parsed = new URL(candidate);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        return "Use an HTTP or HTTPS URL.";
      }
      if (parsed.username || parsed.password) {
        return "Credential-bearing URLs are not accepted.";
      }
      return null;
    } catch {
      return "Use a valid HTTP or HTTPS URL.";
    }
  }

  if (type === "DOMAIN") {
    return domainPattern.test(candidate) ? null : "Use a valid domain name.";
  }

  if (type === "HASH") {
    return hashPattern.test(candidate)
      ? null
      : "Use a common MD5, SHA-1, or SHA-256 hex hash.";
  }

  if (type === "EMAIL") {
    return emailPattern.test(candidate) ? null : "Use a valid email address.";
  }

  return null;
}

export function detectHashAlgorithm(value: string): HashAlgorithm | null {
  const candidate = value.trim();
  if (!/^[a-f0-9]+$/i.test(candidate)) return null;
  if (candidate.length === 32) return "MD5";
  if (candidate.length === 40) return "SHA-1";
  if (candidate.length === 64) return "SHA-256";
  return null;
}

export function safeDefangIndicatorValue(
  value: string,
  type: IndicatorType | string,
) {
  const candidate = normalizeIndicatorValue(value, type);

  if (type === "DOMAIN") return candidate.replaceAll(".", "[.]");

  if ((type === "IP" || type === "CIDR") && z.ipv4().safeParse(candidate.split("/")[0]).success) {
    return candidate.replaceAll(".", "[.]");
  }

  if (type === "EMAIL") {
    const at = candidate.lastIndexOf("@");
    if (at > 0) {
      return `${candidate.slice(0, at + 1)}${candidate.slice(at + 1).replaceAll(".", "[.]" )}`;
    }
  }

  if (type === "URL") {
    try {
      const parsed = new URL(candidate);
      if (parsed.username || parsed.password) return candidate;
      const scheme = parsed.protocol === "https:" ? "hxxps" : "hxxp";
      const host = parsed.hostname.replaceAll(".", "[.]");
      const port = parsed.port ? `:${parsed.port}` : "";
      return `${scheme}://${host}${port}${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch {
      return candidate;
    }
  }

  return candidate;
}

export function validateObservedIndicator(input: {
  value: string;
  type: IndicatorType | string;
}) {
  const observed = String(input.value ?? "");
  const normalized = normalizeObservedIndicatorValue(observed, input.type);
  const error = validateIndicator(normalized, input.type);
  return {
    observed,
    normalized,
    canonical: normalized,
    defangedValue: error
      ? normalized
      : safeDefangIndicatorValue(normalized, input.type),
    valid: !error,
    error,
    defanged: observed.trim() !== normalized,
  };
}

export function detectIndicatorType(
  observedValue: string,
): BulkDetectedIndicatorType | null {
  const candidate = stripConservativeWrapping(observedValue);
  if (!candidate || hasWhitespace(candidate)) return null;

  if (/^(?:hxxps?|https?):\/\//i.test(candidate)) return "URL";
  if (
    z.ipv4().safeParse(candidate).success ||
    z.ipv6().safeParse(candidate).success
  ) {
    return "IP";
  }
  if (/^[^/]+\/\d+$/.test(candidate) && !validateIndicator(candidate, "CIDR")) return "CIDR";
  if (detectHashAlgorithm(candidate)) return "HASH";
  if (emailPattern.test(candidate)) return "EMAIL";

  const refangedDomain = candidate.replace(defangedDot, ".");
  if (domainPattern.test(refangedDomain)) return "DOMAIN";
  return null;
}

export function parseBulkIndicatorInput(input: string): ParsedBulkIoc {
  if (input.length > MAX_BULK_IOC_INPUT_CHARS) {
    throw new Error(
      `Bulk IOC input must not exceed ${MAX_BULK_IOC_INPUT_CHARS.toLocaleString()} characters.`,
    );
  }

  const nonEmpty = input
    .split(/\r?\n/)
    .map((value, index) => ({ value: value.trim(), lineNumber: index + 1 }))
    .filter((line) => line.value.length > 0);

  if (nonEmpty.length > MAX_BULK_IOC_LINES) {
    throw new Error(
      `Bulk IOC input must contain at most ${MAX_BULK_IOC_LINES} non-empty lines.`,
    );
  }

  const seen = new Set<string>();
  const rows: ParsedBulkIocRow[] = nonEmpty.map(({ value, lineNumber }) => {
    if (cvePattern.test(value)) {
      return {
        lineNumber,
        observedValue: value,
        detectedType: null,
        canonicalValue: null,
        defangedValue: null,
        hashAlgorithm: null,
        valid: false,
        validationMessage:
          "Unsupported in IOC bulk intake — add through the CVE module.",
        classification: "UNSUPPORTED_CVE",
      };
    }

    const detectedType = detectIndicatorType(value);
    if (!detectedType) {
      return {
        lineNumber,
        observedValue: value,
        detectedType: null,
        canonicalValue: null,
        defangedValue: null,
        hashAlgorithm: null,
        valid: false,
        validationMessage: "No supported IOC type could be detected safely.",
        classification: "INVALID",
      };
    }

    const checked = validateObservedIndicator({ value, type: detectedType });
    if (!checked.valid) {
      return {
        lineNumber,
        observedValue: value,
        detectedType,
        canonicalValue: checked.normalized,
        defangedValue: checked.defangedValue,
        hashAlgorithm:
          detectedType === "HASH"
            ? detectHashAlgorithm(checked.normalized)
            : null,
        valid: false,
        validationMessage: checked.error,
        classification: "INVALID",
      };
    }

    const key = `${detectedType}:${checked.normalized}`;
    const duplicate = seen.has(key);
    if (!duplicate) seen.add(key);

    return {
      lineNumber,
      observedValue: value,
      detectedType,
      canonicalValue: checked.normalized,
      defangedValue: checked.defangedValue,
      hashAlgorithm:
        detectedType === "HASH"
          ? detectHashAlgorithm(checked.normalized)
          : null,
      valid: true,
      validationMessage: duplicate
        ? "This canonical IOC already appears earlier in the pasted input."
        : null,
      classification: duplicate ? "DUPLICATE_IN_INPUT" : "NEW",
    };
  });

  return { rows, nonEmptyLineCount: nonEmpty.length };
}

export function summarizeBulkIocRows(rows: ParsedBulkIocRow[]) {
  return rows.reduce<Record<BulkIocClassification, number>>(
    (summary, row) => {
      summary[row.classification] += 1;
      return summary;
    },
    {
      NEW: 0,
      DUPLICATE_IN_INPUT: 0,
      ALREADY_EXISTS: 0,
      INVALID: 0,
      UNSUPPORTED_CVE: 0,
    },
  );
}
