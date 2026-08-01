import "server-only";
import type { IocProviderAdapter, NormalizedCandidate, ProviderSkipReason } from "../../types";
import { fetchThreatFoxIocs, testThreatFoxConnection } from "./client";
import { decimalProviderId, parseThreatFoxCursor, serializeThreatFoxCursor } from "./cursor";
import { ThreatFoxError } from "./errors";
import { mapThreatFoxItem, ThreatFoxMappingError } from "./mapping";

const MAX_ITEMS = 1000;
type Mapper = typeof mapThreatFoxItem;
type RawIdentity = { id: string | null; firstSeen: string | null };
function identity(raw: unknown): RawIdentity { if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { id: null, firstSeen: null }; const item=raw as Record<string,unknown>; const date=typeof item.first_seen === "string" ? new Date(item.first_seen.replace(" UTC","Z")) : null; return { id: decimalProviderId(item.id), firstSeen: date && !Number.isNaN(date.valueOf()) ? date.toISOString() : null }; }
function maxId(ids: string[]) { return ids.reduce((max,id)=>BigInt(id)>BigInt(max)?id:max,"0"); }
export function mapThreatFoxWindow(data: unknown[], mapper: Mapper = mapThreatFoxItem, bootstrap = true) {
  if (data.length > MAX_ITEMS) throw new ThreatFoxError("THREATFOX_ITEM_LIMIT", false, undefined, { received_count: data.length });
  const mapped: NormalizedCandidate[] = [], skipped: Array<{ provider_skip_reason: ProviderSkipReason }> = [], skipReasonCounts: Partial<Record<ProviderSkipReason, number>> = {};
  for (const rawItem of data) { try { mapped.push(mapper(rawItem)); } catch (error) { if (!(error instanceof ThreatFoxMappingError)) throw error; skipped.push({ provider_skip_reason: error.reason }); skipReasonCounts[error.reason]=(skipReasonCounts[error.reason]??0)+1; } }
  if (bootstrap && data.length > 0 && mapped.length === 0) throw new ThreatFoxError("THREATFOX_MAPPING_FAILED", false, undefined, { received_count: data.length, mapping_skipped_count: skipped.length, skip_reason_counts: skipReasonCounts });
  return { mapped, skipped, skipReasonCounts, diagnostics: { received_count:data.length, eligible_count:data.length, already_seen_count:0, mapped_count:mapped.length, mapping_skipped_count:skipped.length, skip_reason_counts:skipReasonCounts } };
}
export function buildThreatFoxResult(data: unknown[], cursorValue: string | null = null, mapper: Mapper = mapThreatFoxItem) {
  if (data.length > MAX_ITEMS) throw new ThreatFoxError("THREATFOX_ITEM_LIMIT", false, undefined, { received_count: data.length });
  const cursor=parseThreatFoxCursor(cursorValue), identities=data.map(identity);
  const eligible=data.filter((_,i)=>!cursor || (identities[i].id ? BigInt(identities[i].id!)>BigInt(cursor.max_id) : Boolean(identities[i].firstSeen && cursor.max_first_seen && identities[i].firstSeen!>cursor.max_first_seen)));
  const alreadySeen=data.length-eligible.length;
  const observedIds=identities.flatMap(item=>item.id?[item.id]:[]);
  const observedDates=identities.flatMap(item=>item.firstSeen?[item.firstSeen]:[]);
  const nextMaxId=observedIds.length ? maxId([...observedIds, ...(cursor?[cursor.max_id]:[])]) : cursor?.max_id;
  const nextMaxFirstSeen=[...observedDates, ...(cursor?.max_first_seen?[cursor.max_first_seen]:[])].sort().at(-1) ?? null;
  if (!eligible.length) return { status:"NOT_MODIFIED" as const, items:[] as [], ...(nextMaxId?{nextCursor:serializeThreatFoxCursor(nextMaxId,nextMaxFirstSeen)}:{}), diagnostics:{received_count:data.length,eligible_count:0,already_seen_count:alreadySeen,mapped_count:0,mapping_skipped_count:0,skip_reason_counts:{}} };
  const {mapped,skipped,skipReasonCounts}=mapThreatFoxWindow(eligible,mapper,!cursor);
  if (!nextMaxId) throw new ThreatFoxError("THREATFOX_MAPPING_FAILED");
  return { status:"SUCCEEDED" as const, items:[...mapped,...skipped], nextCursor:serializeThreatFoxCursor(nextMaxId,nextMaxFirstSeen), diagnostics:{received_count:data.length,eligible_count:eligible.length,already_seen_count:alreadySeen,mapped_count:mapped.length,mapping_skipped_count:skipped.length,skip_reason_counts:skipReasonCounts} };
}
export const threatFoxAdapter: IocProviderAdapter = { key:"THREATFOX",displayName:"ThreatFox Community API",credentialRequired:true,supportedTypes:["DOMAIN","IPV4","IPV6","URL"],supportsScheduling:true,testConnection:testThreatFoxConnection, async sync({credential,settings,cursor,signal}) { if(!credential)throw new ThreatFoxError("THREATFOX_CREDENTIAL_REQUIRED"); const raw=await fetchThreatFoxIocs(credential,Number(settings.lookback_days??1),signal); if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new ThreatFoxError("THREATFOX_INVALID_RESPONSE"); const response=raw as {query_status?:unknown;data?:unknown}; if(typeof response.query_status!=="string"||response.query_status.length>100)throw new ThreatFoxError("THREATFOX_INVALID_RESPONSE"); if(response.query_status!=="ok")throw new ThreatFoxError("THREATFOX_QUERY_FAILED"); if(!Array.isArray(response.data))throw new ThreatFoxError("THREATFOX_INVALID_RESPONSE"); return buildThreatFoxResult(response.data,cursor); } };
