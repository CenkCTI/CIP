import { NextRequest,NextResponse } from "next/server";
import { loadCountryPopup,searchCountryTargets } from "@/lib/fusion/country-data";
export async function GET(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 try {
  const {id}=await params;
  const u=req.nextUrl.searchParams;
  const result=u.get("mode")==="lookup"?await searchCountryTargets(id,u):await loadCountryPopup(id,u);
  return NextResponse.json(result,{headers:{"Cache-Control":"private, no-store"}});
 }catch(error){
  const msg=error instanceof Error?error.message:"Country workspace unavailable";
  return NextResponse.json({error:msg},{status:/not authorized|access|owned|auth/i.test(msg)?403:400,headers:{"Cache-Control":"private, no-store"}});
 }
}
