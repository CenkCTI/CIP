import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {requireOwnedProject} from "@/lib/projects/ownership";
import {loadFusionSourceReader} from "@/lib/fusion/source-reader-data";
const uuid=z.string().uuid();
const types=z.enum(["SOURCE","SOURCE_ASSET","SOURCE_NOTE","ANNOTATION","SOURCE_CLAIM","ATTRIBUTION_CLAIM","ACTOR","CAMPAIGN","INDICATOR","MALWARE","CVE","MITRE","TIMELINE_EVENT","RESEARCH_NOTE","EVIDENCE","COUNTRY_NOTE","INFORMATION_GAP","COLLECTION_REQUIREMENT"]);
export async function GET(request:NextRequest,{params}:{params:Promise<{id:string}>}){
 try{
  const {id}=await params;
  uuid.parse(id);
  const {supabase}=await requireOwnedProject(id);
  const kind=types.parse(request.nextUrl.searchParams.get("type"));
  const recordId=uuid.parse(request.nextUrl.searchParams.get("record"));
  // Never rely on client-provided Source IDs: resolve from authorized canonical inventory.
  const r=await supabase.from("fusion_inventory_items").select("record_type,record_id,source_id,source_annotation_id,source_ids,assigned_source_ids")
   .eq("project_id",id).eq("record_type",kind).eq("record_id",recordId).maybeSingle();
  if(r.error||!r.data)return NextResponse.json({error:"Inventory record not found"},{status:404});
  const item=r.data;

  // Source and Source Annotation identities are immutable provenance, not analyst choices.
  // Never process a particular Annotation against a different manually linked Source.
  const pinnedSource=kind==="SOURCE"?recordId:
    ["ANNOTATION","SOURCE_ASSET","SOURCE_NOTE"].includes(kind)?
      (item.source_id??item.source_ids?.[0]??null):null;
  const links=pinnedSource?[pinnedSource]:[...new Set([
    ...(item.source_id?[item.source_id]:[]),
    ...(item.source_ids??[]),
    ...(item.assigned_source_ids??[])
  ])];
  // Resolve only existing, owner-scoped Sources. Multiple links require explicit analyst selection.
  const associated=links.length?
    await supabase.from("sources").select("id,title").eq("project_id",id).in("id",links).order("title",{ascending:true}).limit(1000):
    kind==="EVIDENCE"?
      await supabase.from("sources").select("id,title").eq("project_id",id).eq("evidence_id",recordId)
        .order("title",{ascending:true}).limit(1000):
      {data:[],error:null};
  if(associated.error)throw Error("Source lookup failed");
  const candidates=associated.data??[];
  if(!candidates.length){
   return NextResponse.json({supported:false,reason:"No Source linked to this Inventory record. Stage 3 extraction requires a real Source annotation. Associate an existing Source in Assignments or register a Source through collection first."},{headers:{"Cache-Control":"private, no-store"}});
  }
  const requestedSource=request.nextUrl.searchParams.get("source");
  if(requestedSource && !uuid.safeParse(requestedSource).success){
   return NextResponse.json({error:"Invalid Source selection"},{status:400});
  }
  if(requestedSource&&!candidates.some(row=>row.id===requestedSource)){
   return NextResponse.json({error:"Selected Source does not belong to this record"},{status:403});
  }
  if(candidates.length>1&&!requestedSource){
   return NextResponse.json({supported:false,reason:"Several Sources are associated with this Inventory record. Choose the Source you want to annotate and process.",choices:candidates},{
     headers:{"Cache-Control":"private, no-store"}
   });
  }
  const candidate=requestedSource??candidates[0].id;
  const sourceReader=await loadFusionSourceReader(id,candidate,
    kind==="ANNOTATION"?recordId:item.source_annotation_id??null);
  return NextResponse.json({supported:true,reader:sourceReader},{
   headers:{"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}
  });
 }catch(error){
  const e=error instanceof Error?error.message:"Unable to load Stage 3 processing";
  // Avoid disclosure of source existence across Investigation boundaries.
  return NextResponse.json({error:/Stage 3|Source reader/.test(e)?e:"Processing unavailable or access denied"},{
   status:403,headers:{"Cache-Control":"private, no-store"}
  });
 }
}
