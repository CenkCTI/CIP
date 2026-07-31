import {NextResponse} from "next/server";
import {authorizeCron,runScheduler,schedulerConfig} from "@/lib/osint/scheduler";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:Request){let config;try{config=schedulerConfig()}catch{return NextResponse.json({error:"Scheduler configuration is invalid."},{status:503})}if(!authorizeCron(request.headers.get("authorization"),config.secret))return NextResponse.json({error:"Unauthorized."},{status:401});try{return NextResponse.json(await runScheduler(config))}catch{return NextResponse.json({error:"Scheduler execution failed safely."},{status:500})}}
export async function POST(){return NextResponse.json({error:"Method not allowed."},{status:405})}
