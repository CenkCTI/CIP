import "server-only";
import {
  validateEmbeddingBatch,type EmbeddingProvider,type EmbeddingMetadata,
  type EmbeddingUsage
} from "./embedding-provider";

const MODEL="intfloat/multilingual-e5-small" as const;
const DIMS=384;
/** Dedicated authenticated worker only: never accept a user-defined URL. */
export function createConfiguredE5Provider():EmbeddingProvider|null{
 if(process.env.CITEM_SEMANTIC_RAG_ENABLED!=="1")return null;
 const endpoint=process.env.CITEM_EMBEDDING_ENDPOINT;
 const key=process.env.CITEM_EMBEDDING_API_KEY;
 const revision=process.env.CITEM_EMBEDDING_MODEL_REVISION;
 const allowed=process.env.CITEM_EMBEDDING_ALLOWED_HOST;
 if(!endpoint||!key||key.length<24||!revision||
    !/^[a-f0-9]{40}$/.test(revision)||!allowed)return null;
 let target:URL;
 try{target=new URL(endpoint);}catch{return null;}
 if(target.hostname!==allowed||target.username||target.password||
   target.search||target.hash||
   target.pathname!=="/v1/embeddings"||
   !(target.protocol==="https:"||
      (target.protocol==="http:"&&["127.0.0.1","localhost","::1"].includes(target.hostname))))
    return null;
 const metadata:EmbeddingMetadata={
  providerId:"citem-local-e5",modelId:MODEL,modelRevision:revision,
  dimensions:DIMS,metric:"cosine",normalized:true,
  maxInputTokens:512,dataBoundary:"LOCAL",
 };
 return {metadata,embed:async(texts:readonly string[],purpose:EmbeddingUsage)=>{
  if(!texts.length||texts.length>16||texts.some(t=>t.length<1||t.length>1600))
   throw new Error("EMBEDDING_INPUT_LIMIT");
  const request=texts.map(t=>(purpose==="query"?"query: ":"passage: ")+t);
  const response=await fetch(target.toString(),{
   method:"POST",cache:"no-store",
   headers:{"content-type":"application/json","authorization":"Bearer "+key},
   body:JSON.stringify({model:MODEL,input:request,revision,encoding_format:"float"}),
   signal:AbortSignal.timeout(20000),
  });
  if(!response.ok)throw new Error("EMBEDDING_PROVIDER_UNAVAILABLE");
  const length=Number(response.headers.get("content-length")??0);
  if(length>250_000)throw new Error("EMBEDDING_PROVIDER_INVALID_RESPONSE");
  const payload=await response.json() as {
   model?:string;revision?:string;
   data?:{index:number;embedding:number[]}[];
  };
  if(payload.model!==MODEL||payload.revision!==revision||
     !Array.isArray(payload.data)||payload.data.length!==texts.length)
    throw new Error("EMBEDDING_PROVIDER_INVALID_RESPONSE");
  const vectors=[...payload.data].sort((a,b)=>a.index-b.index);
  if(vectors.some((x,i)=>x.index!==i))throw new Error("EMBEDDING_INDEX_MISMATCH");
  const result=vectors.map(x=>x.embedding);
  validateEmbeddingBatch(metadata,result,texts.length);
  return result;
 }};
}
