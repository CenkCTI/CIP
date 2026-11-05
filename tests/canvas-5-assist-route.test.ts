import { afterEach, describe, expect, it, vi } from "vitest";

const projectId = "a72353f5-0a30-42e5-8e84-cd38b89de101";
const boardId = "a72353f5-0a30-42e5-8e84-cd38b89de102";
const noteId = "a72353f5-0a30-42e5-8e84-cd38b89de103";
const otherId = "a72353f5-0a30-42e5-8e84-cd38b89de104";
const ownerId = "a72353f5-0a30-42e5-8e84-cd38b89de105";

const requireOwnedProject = vi.fn();
const requireResearchByok = vi.fn(async()=>({model:"test-model",apiKey:"never-expose"}));
const withResearchQuota = vi.fn(async(_ctx:unknown,_chars:number,job:()=>Promise<unknown>)=>job());
const byokChat = vi.fn(async()=>JSON.stringify({
  summary:"Analyst-only tentative hypothesis",
  hypotheses:[],observations:[{item_id:noteId,quote:"Sample analyst note about unverified attack",
    significance:"Not independently verified"}],
  link_proposals:[],questions:["What source would confirm the observation?"],
}));
vi.mock("@/lib/projects/ownership",()=>({requireOwnedProject}));
vi.mock("@/lib/ai/research/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/research/server")>();
  return {...actual,requireResearchByok,withResearchQuota};
});
vi.mock("@/lib/ai/byok/client",()=>({byokChat}));

function query(result:unknown){
  const chain:Record<string,unknown>={};
  for(const method of ["select","eq","in","limit"])chain[method]=vi.fn(()=>chain);
  chain.maybeSingle=vi.fn(async()=>result);
  chain.then=(resolve:(value:unknown)=>unknown)=>Promise.resolve(result).then(resolve);
  return chain;
}
function owner(rows:{id:string;kind:string;content?:string;record_type?:string;record_id?:string}[]=[
 {id:noteId,kind:"NOTE",content:"Sample analyst note about unverified attack evidence."},
]){
  const rpc = vi.fn();
  const from = vi.fn((table:string)=>{
    if(table==="analysis_canvases")return query({
      data:{id:boardId,revision:4,created_by:ownerId},error:null,
    });
    if(table==="analysis_canvas_items")return query({data:rows,error:null});
    if(table==="analysis_canvas_edges")return query({data:[],error:null});
    if(table==="fusion_inventory_items")return query({data:[],error:null});
    throw Error("Unexpected DB table: "+table);
  });
  return {user:{id:ownerId},projectId,supabase:{from,rpc}};
}
const params={params:Promise.resolve({id:projectId,canvasId:boardId})};
function req(data:Record<string,unknown>){
  return new Request("https://example.test/assist",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
      question:"Assess this uncertain observation",expectedRevision:4,
      selectedItemIds:[noteId],byokConsent:true,language:"en",...data,
    }),
  });
}
afterEach(()=>{vi.clearAllMocks();});
describe("CANVAS-5 live owner-only AI route",()=>{
  it("uses server-resolved notes, verifies quotes and does not mutate Canvas",async()=>{
    const ctx=owner();
    requireOwnedProject.mockResolvedValueOnce(ctx);
    const {POST}=await import("@/app/api/projects/[id]/canvases/[canvasId]/assist/route");
    const res=await POST(req({}),params);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("no-store");
    const body=await res.json();
    expect(body.result.observations).toHaveLength(1);
    expect(body.result.observations[0].scope).toBe("CANVAS_NOTE");
    expect(body.result.revision).toBe(4);
    expect(body.notice).toContain("no Canvas writes");
    expect(ctx.supabase.rpc).not.toHaveBeenCalled();
    const sent=byokChat.mock.calls[0];
    expect(JSON.stringify(sent)).toContain("Sample analyst note");
    expect(JSON.stringify(sent)).not.toContain("never-expose");
  });
  it("blocks foreign Investigations and never calls the model",async()=>{
    requireOwnedProject.mockRejectedValueOnce(new Error("Investigation not found"));
    const {POST}=await import("@/app/api/projects/[id]/canvases/[canvasId]/assist/route");
    const result=await POST(req({}),params);
    expect(result.status).toBe(404);
    expect(byokChat).not.toHaveBeenCalled();
  });
  it("blocks stale board versions before sending any notes to NVIDIA",async()=>{
    requireOwnedProject.mockResolvedValueOnce(owner());
    const {POST}=await import("@/app/api/projects/[id]/canvases/[canvasId]/assist/route");
    const result=await POST(req({expectedRevision:3}),params);
    expect(result.status).toBe(409);
    expect(requireResearchByok).not.toHaveBeenCalled();
  });
  it("rejects off-canvas selected IDs and FRAME nodes",async()=>{
    requireOwnedProject.mockResolvedValueOnce(owner([]));
    const {POST}=await import("@/app/api/projects/[id]/canvases/[canvasId]/assist/route");
    const missing=await POST(req({}),params);
    expect(missing.status).toBe(400);
    requireOwnedProject.mockResolvedValueOnce(owner([{id:noteId,kind:"FRAME",content:"Group"}]));
    const frame=await POST(req({}),params);
    expect(frame.status).toBe(400);
    expect(byokChat).not.toHaveBeenCalled();
  });
  it("requires explicit BYOK consent and rejects fake source text",async()=>{
    const {POST}=await import("@/app/api/projects/[id]/canvases/[canvasId]/assist/route");
    const result=await POST(req({byokConsent:false}),params);
    expect(result.status).toBe(400);
    const fake=await POST(req({sourceText:"fabricated evidence"}),params);
    expect(fake.status).toBe(400);
    expect(requireOwnedProject).not.toHaveBeenCalled();
  });
  it("never generates invented observations if the selected record has no text",async()=>{
    requireOwnedProject.mockResolvedValueOnce(owner([{
      id:noteId,kind:"NOTE",content:"brief",
    }]));
    const {POST}=await import("@/app/api/projects/[id]/canvases/[canvasId]/assist/route");
    const result=await POST(req({}),params);
    expect(result.status).toBe(422);
    expect(byokChat).not.toHaveBeenCalled();
  });
});
