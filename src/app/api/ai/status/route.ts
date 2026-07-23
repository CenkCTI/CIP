import { NextResponse } from "next/server";
import { checkAiProviderStatus } from "@/lib/ai/client";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() { return NextResponse.json(await checkAiProviderStatus(), { headers: { "cache-control": "no-store" } }); }
