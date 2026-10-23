/**
 * Phase B provider boundary. Import this module only from the server.
 * No network call and no provider is enabled by importing this contract.
 */
export type EmbeddingMetadata={
  providerId:string;modelId:string;modelRevision:string;
  dimensions:number;metric:"cosine";normalized:boolean;
  maxInputTokens:number;dataBoundary:"LOCAL"|"EXTERNAL";
};
export type EmbeddingUsage="query"|"passage";
export interface EmbeddingProvider{
  readonly metadata:EmbeddingMetadata;
  embed(texts:readonly string[],purpose:EmbeddingUsage):Promise<readonly number[][]>;
}
export type EmbeddingConsent={
  semanticEnabled:boolean;
  externallyProcessedDocumentsApproved:boolean;
  sourceAllowsExternalProcessing:boolean;
};

/** Never send investigator text, notes, source bytes or queries externally by default. */
export function canUseEmbeddingProvider(metadata:EmbeddingMetadata|undefined,
 consent:EmbeddingConsent):boolean{
 if(!consent.semanticEnabled||!metadata)return false;
 if(metadata.dataBoundary==="LOCAL")return true;
 return consent.externallyProcessedDocumentsApproved&&
   consent.sourceAllowsExternalProcessing;
}
export function validateEmbeddingBatch(
 metadata:EmbeddingMetadata,rows:readonly (readonly number[])[],
 expectedCount:number,
):void{
 if(!metadata.providerId||!metadata.modelId||!metadata.modelRevision||
   !Number.isInteger(metadata.dimensions)||metadata.dimensions<32||
   metadata.dimensions>4096||!Number.isInteger(metadata.maxInputTokens)||
   metadata.maxInputTokens<32||metadata.maxInputTokens>32768||
   metadata.metric!=="cosine"||
   rows.length!==expectedCount||expectedCount<1||expectedCount>32){
   throw new Error("EMBEDDING_CONTRACT_INVALID");
 }
 for(const vec of rows){
   if(vec.length!==metadata.dimensions||vec.some(x=>!Number.isFinite(x))||
     vec.every(x=>x===0))throw new Error("EMBEDDING_VECTOR_INVALID");
 }
}
export function compatibleEmbeddings(query:EmbeddingMetadata,passage:EmbeddingMetadata):boolean{
 return query.providerId===passage.providerId&&
  query.modelId===passage.modelId&&
  query.modelRevision===passage.modelRevision&&
  query.dimensions===passage.dimensions&&query.metric===passage.metric&&
  query.normalized===passage.normalized;
}
