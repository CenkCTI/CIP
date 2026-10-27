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
  let candidate=kind==="SOURCE"?recordId:(item.source_ids?.[0]??item.assigned_source_ids?.[0]??null);
  // Evidence linked from collection may be backed by an already existing source.
  if(!candidate&&kind==="EVIDENCE"){
   const matched=await supabase.from("sources").select("id").eq("project_id",id).eq("evidence_id",recordId).limit(2);
   if(matched.error)throw Error("Source lookup failed");
   candidate=matched.data?.[0]?.id??null;
  }
  if(!candidate){
   return NextResponse.json({supported:false,reason:"No Source linked to this Inventory record. Stage 3 extraction requires a real Source annotation; first associate an existing Source in Assignments, or create a Source in the collection workflow."},{headers:{"Cache-Control":"private, no-store"}});
  }
  const checked=await supabase.from("sources").select("id").eq("project_id",id).eq("id",candidate).maybeSingle();
  if(checked.error||!checked.data){
   return NextResponse.json({supported:false,reason:"The linked Source no longer exists in this Investigation."},{headers:{"Cache-Control":"private, no-store"}});
  }
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
