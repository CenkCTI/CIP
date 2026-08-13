const NODE_SOURCES=new Set(['CISA_KEV','NVD_CVE','FIRST_EPSS','THREATFOX','MALWAREBAZAAR']);
export const LEGACY_COLLECTION_BLOCKED_MESSAGE='Collection is managed by BAYKUSH Intelligence Node. Legacy CİTEM collection is paused.';
type CollectionAuthorityEnvironment=Readonly<Record<string,string|undefined>>;
export function legacyCollectionMode(env:CollectionAuthorityEnvironment=process.env){return env.CITEM_LEGACY_TECHINT_COLLECTION_MODE==='MANUAL_ROLLBACK'?'MANUAL_ROLLBACK':'NODE_AUTHORITY';}
export function legacyCollectionAllowed(sourceKey:string,env:CollectionAuthorityEnvironment=process.env){return !NODE_SOURCES.has(sourceKey)||legacyCollectionMode(env)==='MANUAL_ROLLBACK';}
export function assertLegacyCollectionAllowed(sourceKey:string,env:CollectionAuthorityEnvironment=process.env){if(!legacyCollectionAllowed(sourceKey,env))throw new Error(LEGACY_COLLECTION_BLOCKED_MESSAGE);}
