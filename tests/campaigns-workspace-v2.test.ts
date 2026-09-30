import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Campaigns workspace v2", () => {
  const workspace = readFileSync("src/components/campaigns/campaign-workspace.tsx", "utf8");
  const actions = readFileSync("src/app/projects/[id]/campaign-actions.ts", "utf8");
  const projectPage = readFileSync("src/app/projects/[id]/page.tsx", "utf8");
  const detailPage = readFileSync("src/app/projects/[id]/[module]/[entityId]/page.tsx", "utf8");

  it("moves Campaign creation behind a focused modal", () => {
    expect(workspace).toContain("+ Add campaign");
    expect(workspace).toContain('role="dialog"');
    expect(workspace).toContain("Additional context");
    expect(workspace).not.toContain("Search relationships");
    expect(projectPage).toContain("<CampaignDirectory");
    expect(projectPage).not.toContain('<CtiList\n          tab="campaigns"');
  });

  it("uses the charcoal, stone and amber Campaign visual hierarchy", () => {
    expect(workspace).toContain('bg-[#0f1417]');
    expect(workspace).toContain("text-amber-300");
    expect(workspace).toContain("border-stone-800");
    expect(workspace).not.toContain("text-cyan");
    expect(workspace).not.toContain("bg-cyan");
  });

  it("keeps Campaign profile edits separate from relationship mutation", () => {
    expect(actions).toContain('.from("campaigns")');
    expect(actions).toContain(".update(parsed.data)");
    expect(actions).not.toContain("replace_cti_relationships");
    expect(actions).not.toContain("campaign_threat_actors");
  });

  it("replaces the generic Campaign detail dump with focused operational surfaces", () => {
    expect(detailPage).toContain("<CampaignProfileHeader");
    expect(detailPage).toContain("<CampaignTechnicalContext");
    expect(detailPage).toContain("Edit reconstruction");
    expect(detailPage).toContain("Open Attribution Analysis");
    expect(detailPage).toContain('tab === "campaigns" ?');
  });
});
