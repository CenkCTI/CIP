import {describe,it,expect} from "vitest";
import {planMultilingualLexicalProbes} from "@/lib/ai/stage3/multilingual-query-plan";
describe("Phase B search-only TR-FR-EN probes",()=>{
 it("maps Turkish intelligence-purpose questions to French source wording",()=>{
  const p=planMultilingualLexicalProbes("Bu saldırıların stratejik amacı ne olabilir?");
  expect(p.some(x=>x.includes("espionnage")&&x.includes("objectifs"))).toBe(true);
 });
 it("does not replace source identifiers with guessed actors",()=>{
  const p=planMultilingualLexicalProbes("APT28 ve CVE-2023-23397'nin amacı nedir?");
  expect(p[0]).toContain("APT28");
  expect(p[0]).toContain("CVE-2023-23397");
  expect(p.join(" ")).not.toContain("APT29");
 });
 it("covers authentication/defence in relevant French vocabulary only",()=>{
  const p=planMultilingualLexicalProbes("Kimlik doğrulama ve korunma önerileri");
  expect(p.join(" ")).toContain("authentification");
  expect(p.join(" ")).toContain("recommandations");
  expect(p.length).toBeLessThanOrEqual(3);
 });
 it("keeps independent conceptual questions free of source-assertion additions",()=>{
  expect(planMultilingualLexicalProbes("Merhaba, nasılsın?")).toEqual([]);
  expect(planMultilingualLexicalProbes("APT28 nedir?")).toEqual(["APT28"]);
 });
 it("caps search probes rather than concatenating a private PDF or chat history",()=>{
  const p=planMultilingualLexicalProbes("APT28 hedef kurum saldırı stratejik amaç "+
    "korunma önerileri kimlik doğrulama teknikleri");
  expect(p.length).toBeLessThanOrEqual(3);
  expect(p.every(x=>x.length<120)).toBe(true);
 });
});
