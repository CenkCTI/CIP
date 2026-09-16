import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NodeDegradedState } from "@/components/techint/node-degraded-state";
import { DiscoveryWorkbench } from "@/components/techint/discovery-workbench";
import { run } from "../scripts/node8-citem-cutover-acceptance.mjs";

const root=process.cwd();
describe("NODE-8 CİTEM cutover contract",()=>{
  it("emits synthetic contract evidence that cannot be confused with production acceptance",async()=>{
    process.env.CITEM_COMMIT_SHA="a".repeat(40);
    const evidence=await run("synthetic");
    expect(evidence).toMatchObject({schemaVersion:"CITEM_NODE8_CUTOVER_CONTRACT_V1",evidenceClass:"SYNTHETIC",result:"PASS",productionStatus:"MANUAL_PENDING"});
    expect(evidence.limitations).toEqual(expect.arrayContaining(["CONTRACT_ONLY","NOT_PRODUCTION_ACCEPTANCE"]));
    expect(JSON.stringify(evidence)).not.toContain("CITEM_NODE8_CUTOVER_EVIDENCE_V1");
  });
  it("keeps config/client server-only, contains no public token contract, and exposes no mutation method",()=>{
    const config=readFileSync(path.join(root,"src/lib/baykush-node/config.ts"),"utf8");
    const client=readFileSync(path.join(root,"src/lib/baykush-node/client.ts"),"utf8");
    const queries=readFileSync(path.join(root,"src/lib/baykush-node/queries.ts"),"utf8");
    expect(config).toContain('import "server-only"');expect(client).toContain('import "server-only"');
    expect(config+client+queries).not.toMatch(/NEXT_PUBLIC_(?:BAYKUSH_)?NODE_API_TOKEN/);
    expect(client).toContain('method: "GET"');expect(client+queries).not.toMatch(/method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/);
  });
  it("renders failures as degraded unknown rather than a valid zero",()=>{
    render(<NodeDegradedState context="NODE DATA"/>);
    expect(screen.getByRole("status")).toHaveTextContent("DEGRADED");
    expect(screen.getByRole("status")).toHaveTextContent("UNKNOWN");
    expect(screen.getByRole("status")).toHaveTextContent("not zero");
  });
  it("keeps successful discovery data when another request fails",()=>{
    render(<DiscoveryWorkbench range="24h" convergence={[]} convergenceUnavailable={false} newEntitiesUnavailable compositionUnavailable topMoversUnavailable geographyUnavailable/>);
    expect(screen.getByText("No convergence findings published for this range.")).toBeInTheDocument();
    expect(screen.getAllByRole("status").length).toBeGreaterThanOrEqual(4);
    expect(screen.getByText(/Top movers unavailable/)).toHaveTextContent("not no movement");
  });
});
