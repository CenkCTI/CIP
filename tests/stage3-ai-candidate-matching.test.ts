import { describe,expect,it,vi } from "vitest";
import { findExistingCandidateMatches } from "@/lib/ai/stage3/matching";
import { verifyStage3Candidates, type Stage3CandidateModel } from "@/lib/ai/stage3/candidates";

const sourceId="49429515-bc04-4539-ae53-69f0b47157cb";
const assetId="49429615-bc04-4539-ae53-69f0b47157cb";
const support=[{source_token:"DOC_P001_C01",quote:"CVE-2024-12345 is reported."}];
const raw:Stage3CandidateModel={kind:"CVE",cveId:"CVE-2024-12345",derivation:"EXTRACTED",caveats:[],sourceSupport:support};
const [candidate]=verifyStage3Candidates([raw],[{token:"DOC_P001_C01",page:1,kind:"PDF",
  sourceId,assetId,text:"The source states CVE-2024-12345 is reported."}]).candidates;
const projectId="49429715-bc04-4539-ae53-69f0b47157cb";

function fakeOwned(rows:{id:string}[],error:null|{message:string}=null){
  const keys:{key:string;value:string}[]=[];
  const query={
    select:vi.fn(()=>query),
    eq:vi.fn((key:string,value:string)=>{keys.push({key,value});return query;}),
    limit:vi.fn(()=>query),
    then:(resolve:(v:unknown)=>unknown)=>Promise.resolve({data:rows,error}).then(resolve),
  };
  const from=vi.fn(()=>query);
  return {owned:{projectId,supabase:{from}} as never,keys,query,from};
}
describe("Project-scoped exact candidate matching",()=>{
  it("queries only a fixed table and exact CVE id inside the owned investigation",async()=>{
    const matchId="49429815-bc04-4539-ae53-69f0b47157cb";
    const {owned,keys,from,query}=fakeOwned([{id:matchId}]);
    const result=await findExistingCandidateMatches(owned,candidate);
    expect(from).toHaveBeenCalledWith("cves");
    expect(keys).toContainEqual({key:"project_id",value:projectId});
    expect(keys).toContainEqual({key:"cve_id",value:"CVE-2024-12345"});
    expect(query.limit).toHaveBeenCalledWith(5);
    expect(result).toEqual({matchStatus:"CHECKED",matches:[{id:matchId,label:"CVE-2024-12345",matchType:"EXACT"}]});
  });
  it("reports lookup errors as unavailable rather than incorrectly claiming there is no duplicate",async()=>{
    const {owned}=fakeOwned([],{message:"database error"});
    expect(await findExistingCandidateMatches(owned,candidate)).toEqual({matches:[],matchStatus:"UNAVAILABLE"});
  });
  it("does not scan unrelated tables for attribution candidates or unresolved questions",async()=>{
    const {owned,from}=fakeOwned([]);
    const other={...candidate,kind:"ATTRIBUTION_CLAIM",claimedActorText:"APT28",attributionText:"Source said APT28",derivation:"EXTRACTED"} as never;
    expect(await findExistingCandidateMatches(owned,other)).toEqual({matches:[],matchStatus:"CHECKED"});
    expect(from).not.toHaveBeenCalled();
  });
});
