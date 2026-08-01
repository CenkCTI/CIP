export const candidateTypes = ["IPV4", "IPV6", "CIDR", "DOMAIN", "HOSTNAME", "URL", "MD5", "SHA1", "SHA256", "CVE"] as const;
export type IocCandidateType = (typeof candidateTypes)[number];
export type NormalizedCandidate = {
  provider_item_id: string; candidate_type: IocCandidateType; normalized_value: string; original_value: string;
  network_port: number | null; provider_reference_url: string | null; threat_type: string | null; malware_family: string | null;
  confidence_score: number | null; first_seen_at: string | null; last_seen_at: string | null; tags: string[];
  metadata: Record<string, unknown>; source_fingerprint: string;
};
export const providerSkipReasons = ["UNSUPPORTED_IOC_TYPE", "INVALID_PROVIDER_RECORD", "INVALID_IOC", "INVALID_IP", "INVALID_PORT", "INVALID_DATE", "INVALID_DATE_ORDER", "INVALID_CONFIDENCE"] as const;
export type ProviderSkipReason = (typeof providerSkipReasons)[number];
export type ProviderSkippedItem = { provider_skip_reason: ProviderSkipReason };
export type AdapterItem = NormalizedCandidate | ProviderSkippedItem;
export type AdapterDiagnostics = { received_count: number; mapped_count: number; mapping_skipped_count: number; skip_reason_counts: Partial<Record<ProviderSkipReason, number>> };
export type AdapterResult = { status: "SUCCEEDED"; items: AdapterItem[]; nextCursor?: string; diagnostics?: AdapterDiagnostics } | { status: "NOT_MODIFIED"; items: []; diagnostics?: AdapterDiagnostics };
export type AdapterContext = { ownerId: string; connectionId: string; cursor: string | null; settings: Record<string, unknown>; credential?: string; signal?: AbortSignal };
export interface IocProviderAdapter { readonly key: string; readonly displayName: string; readonly credentialRequired: boolean; readonly supportedTypes: readonly IocCandidateType[]; readonly supportsScheduling: boolean; testConnection?(credential: string, signal?: AbortSignal): Promise<void>; sync(context: AdapterContext): Promise<AdapterResult> }
