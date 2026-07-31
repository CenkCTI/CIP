import {beforeEach,describe,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
vi.mock("@/lib/research-feeds/orchestrator",()=>({ingestStoredResearchFeed:vi.fn()}));
vi.mock("@/lib/research-feeds/trusted-workflow-client",()=>({claimDueOsintFeeds:vi.fn()}));
import {authorizeCron,schedulerConfig} from "@/lib/osint/scheduler";
describe("OSINT scheduler boundary",()=>{
 beforeEach(()=>vi.clearAllMocks());
 it("rejects missing, malformed and incorrect credentials",()=>{expect(authorizeCron(null,"secret")).toBe(false);expect(authorizeCron("Basic secret","secret")).toBe(false);expect(authorizeCron("Bearer wrong","secret")).toBe(false)});
 it("accepts an exact bearer credential through timing-safe comparison",()=>expect(authorizeCron("Bearer secret","secret")).toBe(true));
 it("uses bounded safe defaults",()=>expect(schedulerConfig({} as NodeJS.ProcessEnv)).toMatchObject({enabled:false,batchSize:20,concurrency:3,budgetMs:45000}));
 it("rejects invalid and out-of-range configuration",()=>{expect(()=>schedulerConfig({OSINT_FETCH_BATCH_SIZE:"21"} as NodeJS.ProcessEnv)).toThrow("INVALID_OSINT");expect(()=>schedulerConfig({OSINT_SCHEDULER_ENABLED:"yes"} as NodeJS.ProcessEnv)).toThrow("INVALID_OSINT")});
});
