import { describe,it,expect } from "vitest";
import countries from "@/lib/fusion/countries.json";
import world from "@/lib/fusion/world-110m.json";
import { graphEntityTypes, entityTableMap, graphPrefix } from "@/lib/graph/types";
describe("Fusion world countries and graph contract",()=>{
 it("covers the full ISO country and territory reference catalog",()=>{
  expect(countries).toHaveLength(249);
  expect(new Set(countries.map(c=>c.iso2)).size).toBe(249);
  expect(new Set(countries.map(c=>c.iso3)).size).toBe(249);
  for(const country of countries){
    expect(country.iso2).toMatch(/^[A-Z]{2}$/);
    expect(country.iso3).toMatch(/^[A-Z]{3}$/);
    expect(country.name.length).toBeGreaterThan(0);
  }
 });
 it("keeps polygon selection mapped to official country codes",()=>{
  expect(world.features.length).toBeGreaterThan(150);
  const known=new Set(countries.map(c=>c.iso3));
  for(const feature of world.features){
    expect(known.has(feature.id)).toBe(true);
    expect(["Polygon","MultiPolygon"]).toContain(feature.geometry.type);
  }
 });
 it("extends the existing graph mappings without losing legacy types",()=>{
  for(const legacy of ["ACTOR","CAMPAIGN","INDICATOR","MALWARE","CVE","MITRE","EVIDENCE","REPORT","INFRASTRUCTURE_CLUSTER"]){
    expect(graphEntityTypes).toContain(legacy);
  }
  for(const fresh of ["COUNTRY","SOURCE","SOURCE_ASSET","SOURCE_NOTE","ANNOTATION","SOURCE_CLAIM","ATTRIBUTION_CLAIM","RESEARCH_NOTE","TIMELINE_EVENT","COUNTRY_NOTE"]){
    expect(graphEntityTypes).toContain(fresh);
    expect(entityTableMap[fresh as keyof typeof entityTableMap]).toBeTruthy();
    expect(graphPrefix[fresh as keyof typeof graphPrefix]).toBeTruthy();
  }
 });
});
