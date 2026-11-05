import { NextRequest,NextResponse } from "next/server";
import { requireOwnedProject } from "@/lib/projects/ownership";
export async function GET(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 try {
 const {id}=await params;
 const {supabase}=await requireOwnedProject(id);
 const q=(req.nextUrl.searchParams.get("q")??"").slice(0,120).replace(/[(),.*%_\\]/g," ").trim();
 const page=Math.max(1,Math.min(10000,Math.floor(Number(req.nextUrl.searchParams.get("page"))||1)));
 let query=supabase.from("evidence").select("id,title,original_file_name",{count:"exact"}).eq("project_id",id)
  .order("created_at",{ascending:false});
 if(q)query=query.ilike("title",`%${q}%`);
 const result=await query.range((page-1)*20,page*20-1);
 if(result.error)throw Error("Cannot search authorized Evidence");
 return NextResponse.json({items:result.data??[],count:result.count??0,page},{headers:{"Cache-Control":"private, no-store"}});
 }catch{return NextResponse.json({error:"Evidence search unavailable"},{status:403});}
}
