import {describe,it,expect} from "vitest";
import {locatePdfEvidence,quoteRangeRects} from "@/lib/collection/evidence-focus";

describe("Evidence Focus exact native PDF text targeting",()=>{
  function layer(...fragments:string[]){
    const el=document.createElement("div");
    for(const fragment of fragments){
      const span=document.createElement("span");
      span.textContent=fragment;
      el.append(span);
    }
    return el;
  }
  it("maps an exact citation across PDF.js text spans to a native DOM Range",()=>{
    const el=layer("Your reports cites examples of ","China being the leading provider",
      " of digital television services in all of Africa.");
    const range=locatePdfEvidence(el,"China being the leading provider of digital television services");
    expect(range).not.toBeNull();
    expect(range?.toString()).toBe("China being the leading provider of digital television services");
  });
  it("locates unique evidence with missing span whitespace without changing DOM text",()=>{
    const el=layer("StarTimes offers digital ","television services"," to Africa");
    const before=el.textContent;
    const range=locatePdfEvidence(el,"StarTimes offers digital television services to Africa");
    expect(range).not.toBeNull();
    expect(el.textContent).toBe(before);
  });
  it("does not guess short, absent or ambiguous quotations",()=>{
    const el=layer("StarTimes has thirteen million subscribers in Africa. "+
      "StarTimes has thirteen million subscribers in Africa.");
    expect(locatePdfEvidence(el,"StarTimes has thirteen million subscribers in Africa.")).toBeNull();
    expect(locatePdfEvidence(el,"unrelated exact verified phrase from another page")).toBeNull();
    expect(locatePdfEvidence(el,"2023")).toBeNull();
  });
  it("gets bounded page-relative geometry without storing annotations",()=>{
    const page=document.createElement("section");
    const el=layer("Target specific source evidence");
    page.append(el);
    const r=locatePdfEvidence(el,"Target specific source evidence");
    expect(r).not.toBeNull();
    Object.defineProperty(page,"getBoundingClientRect",{value:()=>({
      left:100,top:80,width:600,height:800,right:700,bottom:880,
    })});
    Object.defineProperty(r!,"getClientRects",{value:()=>[{
      left:150,top:120,width:250,height:18,right:400,bottom:138,
    }]});
    expect(quoteRangeRects(r!,page)).toEqual([{left:50,top:40,width:250,height:18}]);
  });
  it("clips targeting overlays on all four page edges without stretching glyphs",()=>{
    const page=document.createElement("section");
    const range=document.createRange();
    Object.defineProperty(page,"getBoundingClientRect",{value:()=>({
      left:100,top:80,width:600,height:800,right:700,bottom:880,
    })});
    Object.defineProperty(range,"getClientRects",{value:()=>[
      {left:95,top:75,right:155,bottom:95,width:60,height:20},
      {left:680,top:870,right:715,bottom:900,width:35,height:30},
      {left:710,top:100,right:720,bottom:120,width:10,height:20},
    ]});
    expect(quoteRangeRects(range,page)).toEqual([
      {left:0,top:0,width:55,height:15},
      {left:580,top:790,width:20,height:10},
    ]);
  });
});
