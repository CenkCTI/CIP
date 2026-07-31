export const candidateTypes = ["IPV4","IPV6","CIDR","DOMAIN","HOSTNAME","URL","MD5","SHA1","SHA256","CVE"] as const;
export type IocCandidateType = (typeof candidateTypes)[number];
export type NormalizedCandidate = {provider_item_id:string;candidate_type:IocCandidateType;normalized_value:string;original_value:string;network_port:number|null;provider_reference_url:string|null;threat_type:string|null;malware_family:string|null;confidence_score:number|null;first_seen_at:string|null;last_seen_at:string|null;tags:string[];metadata:Record<string,unknown>;source_fingerprint:string};
export type AdapterResult={status:"SUCCEEDED";items:NormalizedCandidate[];nextCursor?:string}|{status:"NOT_MODIFIED";items:[]};
export interface IocProviderAdapter {readonly key:string;readonly displayName:string;readonly supportedTypes:readonly IocCandidateType[];readonly supportsScheduling:boolean;sync(cursor:string|null):Promise<AdapterResult>}
