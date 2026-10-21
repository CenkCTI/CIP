import {describe,expect,it} from "vitest";
import {dividePdfBatch,planPdfBatches} from "@/lib/ai/stage3/document-batches";

describe("Entire PDF progressive, bounded reading plan",()=>{
  it("covers every real page exactly once without early sampling, even past 200 pages",()=>{
    for(const n of [1,8,9,45,200,201,505,10000]){
      const batches=planPdfBatches(n);
      const pages=batches.flatMap(({pageStart,pageEnd})=>
        Array.from({length:pageEnd-pageStart+1},(_,i)=>pageStart+i));
      expect(pages).toEqual(Array.from({length:n},(_,i)=>i+1));
      expect(batches.every(({pageStart,pageEnd})=>pageEnd-pageStart<10)).toBe(true);
    }
  });
  it("fails closed for invalid client-known page counts and oversized user-controlled batches",()=>{
    for(const n of [-1,0,1.5,10001,Number.POSITIVE_INFINITY,NaN])
      expect(()=>planPdfBatches(n)).toThrow("invalid_page_count");
    for(const n of [0,11,NaN])
      expect(()=>planPdfBatches(5,n)).toThrow("invalid_batch_size");
  });
  it("recursively splits a dense range into complete non-overlapping pieces",()=>{
    const queue=planPdfBatches(8);
    const original=queue.shift()!;
    const halves=dividePdfBatch(original)!;
    expect(halves).toEqual([{pageStart:1,pageEnd:4},{pageStart:5,pageEnd:8}]);
    expect(dividePdfBatch({pageStart:4,pageEnd:4})).toBeNull();
  });
});
