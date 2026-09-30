import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Knowledge Graph workspace v2", () => {
  const graph = readFileSync("src/components/graph/knowledge-graph.tsx", "utf8");
  const projectPage = readFileSync("src/app/projects/[id]/page.tsx", "utf8");

  it("uses the Graph itself as the full-bleed workspace surface", () => {
    expect(projectPage).toContain('tab === "graph"');
    expect(projectPage).toContain("-mx-4 -mb-4");
    expect(projectPage).toContain('tab !== "graph"');
    expect(graph).toContain("h-[calc(100dvh-7rem)]");
    expect(graph).not.toContain("Graph inspector");
    expect(graph).not.toContain("Entity inspector");
  });

  it("keeps filters hidden in an overlay until requested", () => {
    expect(graph).toContain("filtersOpen");
    expect(graph).toContain("aria-expanded={filtersOpen}");
    expect(graph).toContain("Map controls");
    expect(graph).toContain("Search entities…");
    expect(graph).toContain("Historical infrastructure");
  });

  it("switches broad zoom to readable map labels instead of tiny framed cards", () => {
    expect(graph).toContain("overviewMode");
    expect(graph).toContain("overviewScale");
    expect(graph).toContain("compactGraphLabel");
    expect(graph).toContain('border: "0"');
    expect(graph).toContain('overflow: "visible"');
    expect(graph).toContain("minZoom={0.28}");
    expect(graph).toContain("viewportZoom >= 0.58");
  });

  it("uses multi-depth amber and jade terrain that parallax-zooms with the viewport", () => {
    expect(graph).toContain("terrainFarRef");
    expect(graph).toContain("terrainMidRef");
    expect(graph).toContain("moveTerrain");
    expect(graph).toContain("Math.pow(zoom, 0.34)");
    expect(graph).toContain("Math.pow(zoom, 0.58)");
    expect(graph).toContain("rgba(200,151,66,.14)");
    expect(graph).toContain("rgba(68,130,111,.12)");
    expect(graph).toContain("repeating-radial-gradient");
  });

  it("preserves explicit manual relationship creation and editing", () => {
    expect(graph).toContain("Relationship selection");
    expect(graph).toContain("Source");
    expect(graph).toContain("Target");
    expect(graph).toContain("Swap");
    expect(graph).toContain("Create link");
    expect(graph).toContain("Manual relationship");
    expect(graph).toContain("updateEdge(false)");
    expect(graph).toContain("updateEdge(true)");
  });

  it("preserves saved layout and core map controls", () => {
    expect(graph).toContain("/graph/layout");
    expect(graph).toContain("onNodeDragStop={saveNodePosition}");
    expect(graph).toContain("Fit");
    expect(graph).toContain("Reset");
    expect(graph).toContain("<MiniMap");
    expect(graph).toContain("<Controls");
  });
});
