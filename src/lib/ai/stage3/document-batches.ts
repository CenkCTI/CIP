/** A bounded, resumable plan for reading the entire PDF, not just its first N pages.
 * All requested page ranges are revalidated by the owned-source server endpoint.
 * This is a presentation/orchestration plan; it never persists intelligence records.
 */
export type PdfBatch = {pageStart:number;pageEnd:number};

export const PDF_BATCH_PAGES = 8;
export function planPdfBatches(totalPages:number, batchPages=PDF_BATCH_PAGES):PdfBatch[]{
  if(!Number.isInteger(totalPages)||totalPages<1||totalPages>10_000)
    throw new Error("invalid_page_count");
  if(!Number.isInteger(batchPages)||batchPages<1||batchPages>10)
    throw new Error("invalid_batch_size");
  const batches:PdfBatch[]=[];
  for(let start=1;start<=totalPages;start+=batchPages)
    batches.push({pageStart:start,pageEnd:Math.min(totalPages,start+batchPages-1)});
  return batches;
}
export function dividePdfBatch(batch:PdfBatch):[PdfBatch,PdfBatch]|null {
  if(batch.pageStart>=batch.pageEnd)return null;
  const split=Math.floor((batch.pageStart+batch.pageEnd)/2);
  return [
    {pageStart:batch.pageStart,pageEnd:split},
    {pageStart:split+1,pageEnd:batch.pageEnd},
  ];
}
