import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Knowledge Graph workspace v2", () => {
  const graph = readFileSync("src/components/graph/knowledge-graph.tsx", "utf8");
  const projectPage = readFileSync("src/app/projects/[id]/page.tsx", "utf8");
  const css = readFileSync("src/app/globals.css", "utf8");
  const terrain = readFileSync("public/graph/topographic-terrain.svg", "utf8");

  it("uses the Graph itself as the dedicated workspace surface", () => {
    expect(projectPage).toContain('className="citem-graph-bleed"');
    expect(graph).not.toContain("Graph inspector");
    expect(graph).not.toContain("Entity inspector");
    expect(css).toContain(".citem-content:has(> .citem-graph-bleed)");
    expect(css).toContain("width: 100%");
  });

  it("keeps the map clear of an expanded sidebar and leaves breathing room below the top bar", () => {
    expect(css).not.toContain("width: calc(100vw - 17.25rem)");
    expect(css).toContain("padding: 0.9rem 1rem 1rem");
    expect(graph).toContain("h-[calc(100dvh-6.15rem)]");
    expect(graph).toContain("border border-[#4e4635]/60");
  });

  it("uses the selected clean Topographic concept as a scalable vector terrain", () => {
    expect(graph).toContain('/graph/topographic-terrain.svg');
    expect(terrain).toContain('viewBox="0 0 4096 2304"');
    expect(terrain).toContain('id="amberRidge"');
    expect(terrain).toContain('id="jadeRidge"');
    expect(terrain).toContain("#c9963e");
    expect(terrain).toContain("#4d8a76");
  });

  it("keeps terrain depth calmer than foreground graph zoom", () => {
    expect(graph).toContain("terrainFarRef");
    expect(graph).toContain("terrainMidRef");
    expect(graph).toContain("Math.pow(zoom, 0.24)");
    expect(graph).toContain("Math.pow(zoom, 0.46)");
    expect(graph).toContain("viewport.x * 0.07");
    expect(graph).toContain("viewport.x * 0.16");
  });

  it("keeps filters hidden in an overlay until requested", () => {
    expect(graph).toContain("filtersOpen");
    expect(graph).toContain("aria-expanded={filtersOpen}");
    expect(graph).toContain("Map controls");
    expect(graph).toContain("Search entities…");
    expect(graph).toContain("Historical infrastructure");
  });

  it("preserves readable overview labels and explicit relationship editing", () => {
    expect(graph).toContain("overviewMode");
    expect(graph).toContain("compactGraphLabel");
    expect(graph).toContain("Relationship selection");
    expect(graph).toContain("Create link");
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
