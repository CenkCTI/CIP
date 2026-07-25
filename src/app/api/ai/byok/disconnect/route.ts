import { clearByokCookie } from "@/lib/ai/byok/vault"; import { noStore, safeErr, validateOrigin } from "@/lib/ai/byok/security";
export const runtime="nodejs"; export const dynamic="force-dynamic";
export async function POST(req:Request){ try{ validateOrigin(req); await clearByokCookie(); return noStore({connected:false,state:"disconnected"}); }catch(e){ return safeErr(e); } }
