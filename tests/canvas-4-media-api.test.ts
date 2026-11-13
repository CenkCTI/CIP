import { afterEach, describe, expect, it, vi } from "vitest";

const requireOwnedProject = vi.fn();
vi.mock("@/lib/projects/ownership",()=>({requireOwnedProject}));
const projectId="6c0c6b19-5768-4327-8dc3-734cdb52b201";
const assetId="8de5c0cb-c73c-46f2-beb8-c554911eb201";
const sourceId="63eea26b-9708-47cc-9824-f41cec25b201";
const signed = vi.fn(async()=>({data:{signedUrl:"https://private.example/signed?token=secret"},error:null}));

function context(rows:Record<string,unknown>[]){
  const query:Record<string,unknown>={};
  for(const fn of ["select","eq","in","limit"])query[fn]=vi.fn(()=>query);
  query.then=(resolve:(x:unknown)=>unknown)=>Promise.resolve({data:rows,error:null}).then(resolve);
  const from=vi.fn(()=>query);
  return {supabase:{from,storage:{from:vi.fn(()=>({createSignedUrl:signed}))}},
    projectId};
}
const params={params:Promise.resolve({id:projectId})};
const request=(body:unknown)=>new Request("https://example.local/api",{
  method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),
});
afterEach(()=>{vi.clearAllMocks();});
describe("CANVAS-4 private media access",()=>{
  it("does not query or sign a file in an unauthorized Investigation",async()=>{
    requireOwnedProject.mockRejectedValueOnce(new Error("not owned"));
    const {POST}=await import("@/app/api/projects/[id]/canvases/media/route");
    const response=await POST(request({assetIds:[assetId]}),params);
    expect(response.status).toBe(404);
    expect(signed).not.toHaveBeenCalled();
  });
  it("signs only the authenticated original ready asset, 300 seconds, no cache",async()=>{
    const row={id:assetId,source_id:sourceId,original_filename:"Evidence.pdf",
      mime_type:"application/pdf",size_bytes:10000,storage_path:"private/source/evidence.pdf"};
    const ctx=context([row]);
    requireOwnedProject.mockResolvedValueOnce(ctx);
    const {POST}=await import("@/app/api/projects/[id]/canvases/media/route");
    const response=await POST(request({assetIds:[assetId]}),params);
    const payload=await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(ctx.supabase.from).toHaveBeenCalledWith("source_assets");
    const query=ctx.supabase.from.mock.results[0].value;
    expect(query.eq).toHaveBeenCalledWith("project_id",projectId);
    expect(query.eq).toHaveBeenCalledWith("asset_role","ORIGINAL");
    expect(query.eq).toHaveBeenCalledWith("state","READY");
    expect(signed).toHaveBeenCalledWith("private/source/evidence.pdf",300);
    expect(payload.items[0].kind).toBe("PDF");
    expect(payload.items[0].href).toBe(`/projects/${projectId}/sources/${sourceId}`);
  });
  it("never signs HTML, SVG, script, executable files or oversized PDF assets",async()=>{
    requireOwnedProject.mockResolvedValueOnce(context([
      {id:assetId,source_id:sourceId,mime_type:"text/html",
        original_filename:"x.html",storage_path:"private/x.html",size_bytes:200},
      {id:"439f139f-ac97-4fba-b7b4-4435a619b201",source_id:sourceId,mime_type:"application/pdf",
        original_filename:"giant.pdf",storage_path:"private/giant.pdf",size_bytes:100_000_000},
    ]));
    const {POST}=await import("@/app/api/projects/[id]/canvases/media/route");
    const response=await POST(request({assetIds:[assetId,
      "439f139f-ac97-4fba-b7b4-4435a619b201"]}),params);
    const payload=await response.json();
    expect(payload.items.every((item:{kind:string,signedUrl:string|null})=>
      item.kind==="UNSUPPORTED"&&item.signedUrl===null)).toBe(true);
    expect(signed).not.toHaveBeenCalled();
  });
  it("returns explicit missing IDs without leaking foreign resource metadata",async()=>{
    requireOwnedProject.mockResolvedValueOnce(context([]));
    const {POST}=await import("@/app/api/projects/[id]/canvases/media/route");
    const response=await POST(request({assetIds:[assetId]}),params);
    expect((await response.json()).missing).toEqual([assetId]);
    expect(signed).not.toHaveBeenCalled();
  });
  it("rejects malformed, oversized and arbitrary resource requests",async()=>{
    requireOwnedProject.mockResolvedValue(context([]));
    const {POST}=await import("@/app/api/projects/[id]/canvases/media/route");
    expect((await POST(request({assetIds:["../vault"]}),params)).status).toBe(400);
    expect((await POST(request({assetIds:Array(31).fill(assetId)}),params)).status).toBe(400);
    expect((await POST(request({assetIds:[assetId],storagePath:"anything"}),params)).status).toBe(400);
  });
});
