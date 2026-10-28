import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const map = read("src/components/fusion/fusion-world-map.tsx");
const terrain = read("src/app/api/fusion/atlas-terrain/route.ts");
const night = read("src/app/api/fusion/atlas-texture/route.ts");
const css = read("src/app/globals.css");

describe("CİTEM cinematic world atlas", () => {
 it("uses both georeferenced NASA rasters in the same SVG map space", () => {
  expect(map).toContain('href="/api/fusion/atlas-terrain"');
  expect(map).toContain('href="/api/fusion/atlas-texture"');
  expect(map).toContain('preserveAspectRatio="none"');
  expect(map.indexOf('href="/api/fusion/atlas-terrain"')).toBeLessThan(map.indexOf('href="/api/fusion/atlas-texture"'));
  expect(map.indexOf('href="/api/fusion/atlas-texture"')).toBeLessThan(map.indexOf("mapShapes.map(f=>{"));
 });
 it("keeps the interactive country layer and the analyst popup", () => {
  expect(map).toContain("CountryIntelligencePopup");
  expect(map).toContain('role={code?"button":undefined}');
  expect(map).toContain("onClick={()=>{if(code&&!suppressClick.current)go(code);}}");
  expect(map).toContain("visibleMapLabels");
  expect(map).toContain("fusion-atlas-labels");
 });
 it("keeps geographic interaction transparent and renders non-interactive clouds", () => {
  expect(map).toContain("fusion-atlas-cloud-noise");
  expect(map).toContain("fusion-atlas-vector-fallback");
  expect(map).toContain('pointerEvents="none" className="fusion-atlas-imagery"');
  expect(css).toContain(".fusion-atlas-country:hover");
  expect(css).toContain(".fusion-atlas-clouds");
 });
 it("uses fixed NASA URLs and bounded same-origin image responses, never browser API keys", () => {
  expect(terrain).toContain("eoimages.gsfc.nasa.gov");
  expect(night).toContain("assets.science.nasa.gov");
  expect(night).not.toContain("neo.gsfc.nasa.gov/archive/blackmarble");
  for (const route of [terrain, night]) {
   expect(route).toContain("X-Content-Type-Options");
   expect(route).toContain("Cache-Control");
   expect(route).toContain("new Response(null,{status:503");
  }
 });
});
