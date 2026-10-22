import {z} from "zod";
import {requireOwnedProject} from "@/lib/projects/ownership";
import {readJsonLimited,validateOrigin,noStore} from "@/lib/ai/byok/security";
import {createStage3ReadContext} from "@/lib/ai/stage3/context";
import {ensureIndexedOriginalPDF,InvestigationIndexError} from "@/lib/ai/stage3/indexed-investigation-memory";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const schema=z.object({
  sourceId:z.string().uuid().optional(),
  assetId:z.string().uuid().optional(),
  backfill:z.boolean().optional(),
}).strict().refine(x=>x.backfill===true?(!x.sourceId&&!x.assetId):!!x.sourceId&&!!x.assetId);

export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
  try{
    validateOrigin(req);
    const input=schema.parse(await readJsonLimited(req,2500));
    const owned=await requireOwnedProject((await params).id);
    const reader=createStage3ReadContext(owned);
    let tasks:{source_id:string;id:string}[]=[];
    if(input.backfill){
      // Opt-in backfill handles at most two PDFs per call; never starts
      // unbounded background work or bulk processes other users' documents.
      const {data,error}=await owned.supabase.from("source_assets")
        .select("id,source_id").eq("project_id",owned.projectId)
        .eq("asset_role","ORIGINAL").eq("state","READY")
        .ilike("original_filename","%.pdf").order("ready_at",{ascending:false}).limit(30);
      if(error)throw new InvestigationIndexError("index_database_unavailable");
      const {data:existing,error:ixErr}=await owned.supabase.from("copilot_document_indexes")
        .select("asset_id,status").eq("project_id",owned.projectId).eq("owner_id",owned.user.id);
      if(ixErr)throw new InvestigationIndexError("index_database_unavailable");
      const completed=new Set((existing??[]).filter(v=>v.status==="READY").map(v=>v.asset_id));
      tasks=(data??[]).filter(v=>!completed.has(v.id)).slice(0,2);
    }else tasks=[{id:input.assetId!,source_id:input.sourceId!}];
    const indexed:{sourceId:string;assetId:string;cached?:boolean;chunks:number;pages?:number;processing?:boolean}[]=[];
    const errors:{assetId:string;reason:string}[]=[];
    for(const task of tasks){
      try{
        const result=await ensureIndexedOriginalPDF(owned,task.source_id,task.id,reader);
        indexed.push({sourceId:task.source_id,assetId:task.id,...result});
      }catch(error){
        // Per-asset failures never corrupt the source collection or stop backfill.
        errors.push({assetId:task.id,reason:error instanceof InvestigationIndexError?error.code:"index_failed"});
      }
    }
    return noStore({indexed,errors,completed:tasks.length===0 || errors.length===0,
      message:errors.length?"Some PDF indexes could not be created. The original files remain intact.":"Index prepared."});
  }catch(error){
    if(error instanceof z.ZodError)return noStore({code:"invalid_request",error:"Invalid index request."},{status:400});
    if(error instanceof Error&&error.message==="bad_origin")return noStore({code:"bad_origin",error:"Invalid request origin."},{status:403});
    if(error instanceof Error&&error.message==="Investigation not found")
      return noStore({code:"not_found",error:"Investigation unavailable."},{status:404});
    return noStore({code:"index_unavailable",error:"PDF indexing is unavailable or its database migration is missing."},{status:503});
  }
}
