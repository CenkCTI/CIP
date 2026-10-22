/**
 * Pick short, verbatim contextual passages from server-fetched external text.
 * Lexical ranking is NOT a source reliability rating or a corroboration verdict.
 * No network calls, model inference, or user-supplied web text.
 */
const STOP=new Set(("about above across after against along among around because before being "+
  "between could during from into have having their there these those this that them they "+
  "which while with would should where when what does were been your ours also more over "+
  "than then under very just only article report reports source research investigation "+
  "evidence independent whether compare support contradict leading").split(/\s+/));

function words(input:string):Set<string>{
  return new Set((input.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}-]{2,}/gu)??[])
    .filter(w=>!STOP.has(w)));
}
type Passage={text:string;start:number;score:number};
export function selectRelevantWebPassages(
  sourceText:string,question:string,pdfExcerpt:string,max=3,
):string[]{
  const anchors=words(question+" "+pdfExcerpt);
  if(!anchors.size||!sourceText.trim())return [];
  const boundaries=[0];
  // Split on a sentence-ending delimiter before a new uppercase sentence,
  // not on decimal points in subscriber figures (e.g. 9.69 million).
  const re=/[.!?]\s+(?=[A-Z0-9“"'(])/g;
  for(const m of sourceText.matchAll(re)){
    const end=(m.index??0)+1;
    if(end>boundaries[boundaries.length-1])boundaries.push(end);
  }
  boundaries.push(sourceText.length);
  const segments:Passage[]=[];
  for(let i=0;i<boundaries.length-1;i++){
    const start=boundaries[i],end=boundaries[i+1];
    for(let pos=start;pos<end;pos+=650){
      const stop=Math.min(end,pos+850);
      const raw=sourceText.slice(pos,stop).trim();
      if(raw.length<30)continue;
      const matched=[...words(raw)].filter(term=>anchors.has(term));
      if(matched.length<2)continue;
      const yearMatch=matched.filter(t=>/^20\d{2}$/.test(t)).length;
      const score=matched.length+2*yearMatch+
        (/[\d][,.\d]*\s*(?:million|billion|percent|%|subscribers|users)/i.test(raw)?0.5:0);
      const offset=sourceText.indexOf(raw,pos);
      if(offset>=0)segments.push({text:raw,start:offset,score});
      if(stop===end)break;
    }
  }
  segments.sort((a,b)=>b.score-a.score||a.start-b.start);
  const selected:Passage[]=[];
  for(const item of segments){
    if(selected.some(s=>Math.max(s.start,item.start)<
      Math.min(s.start+s.text.length,item.start+item.text.length)))continue;
    selected.push(item);
    if(selected.length>=max)break;
  }
  return selected.sort((a,b)=>a.start-b.start).map(p=>p.text);
}
