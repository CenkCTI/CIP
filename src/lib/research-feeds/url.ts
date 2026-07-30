import { FeedError } from "./errors";

const blockedHosts = new Set(["localhost","localhost.localdomain","metadata.google.internal","metadata.google.com"]);
export function normalizeFeedUrl(input: string): URL {
  if (!input || /[\r\n\0]/.test(input) || input.includes("%25") || /%(?:0[0-9a-f]|7f)/i.test(input)) throw new FeedError("INVALID_URL");
  let url: URL; try { url = new URL(input); } catch { throw new FeedError("INVALID_URL"); }
  if (!['http:','https:'].includes(url.protocol) || url.username || url.password || url.hash || !url.hostname || url.hostname.includes("%")) throw new FeedError("INVALID_URL");
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (blockedHosts.has(host) || (!host.includes(".") && !host.startsWith("[")) || (url.port && !((url.protocol === "http:" && url.port === "80") || (url.protocol === "https:" && url.port === "443")))) throw new FeedError("INVALID_URL");
  url.hostname = host; if ((url.protocol === "http:" && url.port === "80") || (url.protocol === "https:" && url.port === "443")) url.port="";
  return url;
}
export function redactUrl(input: string | null) { if (!input) return null; try { const u=new URL(input); for (const k of [...u.searchParams.keys()]) u.searchParams.set(k,"REDACTED"); return u.toString(); } catch { return "Invalid URL"; } }
export function normalizeItemUrl(input: string | null, base: string): string | null { if (!input) return null; try { const u=new URL(input,base); if (!['http:','https:'].includes(u.protocol)||u.username||u.password) return null; u.hash=""; return u.toString(); } catch { return null; } }
