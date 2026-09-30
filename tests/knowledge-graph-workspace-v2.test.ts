import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Knowledge Graph workspace v2", () => {
  const graph = readFileSync("src/components/graph/knowledge-graph.tsx", "utf8");

  it("uses the CITEM charcoal, stone and amber visual hierarchy", () => {
    expect(graph).toContain('bg-[#0f1417]');
    expect(graph).toContain("text-amber-300");
    expect(graph).toContain("border-stone-800");
    expect(graph).not.toContain("animated purple");
    expect(graph).not.toContain("text-cyan-200");
  });

  it("keeps filters compact and moves them behind a collapsible surface", () => {
    expect(graph).toContain("Filters");
    expect(graph).toContain("Entity types");
    expect(graph).toContain("Relationship types");
    expect(graph).toContain("Show all");
    expect(graph).toContain("Fit view");
    expect(graph).toContain("Reset view");
  });

  it("keeps manual relationship creation explicit and directional", () => {
    expect(graph).toContain("Relationship selection");
    expect(graph).toContain("Source");
    expect(graph).toContain("Target");
    expect(graph).toContain("Swap");
    expect(graph).toContain("Create link");
    expect(graph).toContain("analyst-defined relationship");
  });

  it("provides a dedicated inspector instead of a generic metadata card", () => {
    expect(graph).toContain("Entity inspector");
    expect(graph).toContain("Graph inspector");
    expect(graph).toContain("Open entity workspace");
    expect(graph).toContain("Edit relationship");
  });

  it("preserves saved layout and historical infrastructure behavior", () => {
    expect(graph).toContain("/graph/layout");
    expect(graph).toContain("Historical infrastructure");
    expect(graph).toContain("showHistoricalInfrastructure");
    expect(graph).toContain("onNodeDragStop={saveNodePosition}");
  });

  it("keeps overview labels readable while allowing a broad zoomed-out perspective", () => {
    expect(graph).toContain("viewportZoom");
    expect(graph).toContain("labelScale");
    expect(graph).toContain("minZoom={0.28}");
    expect(graph).toContain("viewportZoom >= 0.58");
    expect(graph).toContain("h-[calc(100vh-11.5rem)]");
  });

  it("adds map-like terrain depth driven by visible connection density", () => {
    expect(graph).toContain("terrainShadow");
    expect(graph).toContain("degreeMap");
    expect(graph).toContain("contour depth = connection density");
    expect(graph).toContain("repeating-radial-gradient");
    expect(graph).toContain("Terrain depth");
  });
});
