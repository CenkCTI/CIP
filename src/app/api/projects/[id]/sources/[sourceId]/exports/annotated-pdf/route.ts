import { NextResponse } from "next/server";
import { generateAnnotatedSourcePdf, SourcePdfExportError } from "@/lib/collection/pdf-export";

export const runtime="nodejs";

export async function POST(_request:Request,{params}:{params:Promise<{id:string;sourceId:string}>}){
  const {id,sourceId}=await params;
  try{
    const result=await generateAnnotatedSourcePdf(id,sourceId);
    return new NextResponse(result.bytes,{headers:{
      "Content-Type":"application/pdf",
      "Content-Disposition":`attachment; filename="${result.filename}"`,
      "X-CITEM-Export-SHA256":result.sha256,
      "Cache-Control":"private, no-store",
    }});
  }catch(error){
    if(error instanceof SourcePdfExportError)return NextResponse.json({error:error.message},{status:error.status});
    return NextResponse.json({error:"İşaretli PDF çıktısı üretilemedi."},{status:500});
  }
}
