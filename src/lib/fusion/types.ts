export type FusionInventoryItem = {
  project_id: string;
  record_type: string;
  record_id: string;
  title: string;
  summary: string;
  preview_text: string;
  created_at: string;
  updated_at: string;
  origin_kind: string;
  source_id: string | null;
  source_annotation_id: string | null;
  processing_state: string | null;
  metadata: Record<string, unknown>;
  annotation_ids: string[];
  source_ids: string[];
  gap_ids: string[];
  requirement_ids: string[];
  country_codes: string[];
  assigned_source_ids: string[];
  assigned_gap_ids: string[];
  assigned_requirement_ids: string[];
};
export type FusionGroupKind = "source" | "all" | "gap" | "requirement" | "type" | "country";
export const fusionGroupKinds: FusionGroupKind[] = ["source","all","gap","requirement","type","country"];
export type FusionInventoryGroup = { key: string; label: string; items: FusionInventoryItem[] };
export type FusionInventoryFilters = {
  q:string; type:string; source:string; gap:string; requirement:string;
  country:string; state:string; group:FusionGroupKind; page:number; sort:string;
};
export function inventoryDetailUrl(projectId:string, item:FusionInventoryItem):string {
  const root=`/projects/${projectId}`;
  switch(item.record_type) {
    case "SOURCE": return `${root}/sources/${item.record_id}`;
    case "SOURCE_NOTE":
    case "SOURCE_ASSET": return item.source_ids[0]?`${root}/sources/${item.source_ids[0]}`:`${root}/sources`;
    case "ANNOTATION": {
      const id=item.source_ids[0];
      return id?`${root}/sources/${id}?annotation=${item.record_id}`:`${root}/sources`;
    }
    case "SOURCE_CLAIM": return `${root}/source-claims/${item.record_id}`;
    case "RESEARCH_NOTE": return `${root}/notes?note=${item.record_id}`;
    case "EVIDENCE": return `${root}?tab=evidence#evidence-${item.record_id}`;
    case "TIMELINE_EVENT": return `${root}/timeline/${item.record_id}`;
    case "ACTOR": return `${root}/actors/${item.record_id}`;
    case "CAMPAIGN": return `${root}/campaigns/${item.record_id}`;
    case "INDICATOR": return `${root}/indicators/${item.record_id}`;
    case "MALWARE": return `${root}/malware/${item.record_id}`;
    case "CVE": return `${root}/cves/${item.record_id}`;
    case "MITRE": return `${root}/mitre/${item.record_id}`;
    case "COUNTRY_NOTE": {
      const id=item.metadata?.countryId;
      return typeof id==="string" && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)
        ? `${root}/fusion?view=map&countryId=${id}`
        : `${root}/fusion?view=map`;
    }
    case "COLLECTION_REQUIREMENT": return `${root}/collection`;
    case "INFORMATION_GAP": return root;
    default: return `${root}/fusion`;
  }
}
export function groupInventory(items:FusionInventoryItem[],kind:FusionGroupKind, labels?:{
  source?:Record<string,string>;gap?:Record<string,string>;
  requirement?:Record<string,string>;country?:Record<string,string>
}):FusionInventoryGroup[] {
  if(kind==="all") return [{key:"all",label:"All records",items}];
  const groups=new Map<string,FusionInventoryGroup>();
  function add(key:string,label:string,item:FusionInventoryItem) {
    const group=groups.get(key)??{key,label,items:[]};
    if(!group.items.some(x=>x.record_type===item.record_type&&x.record_id===item.record_id)) group.items.push(item);
    groups.set(key,group);
  }
  for(const item of items) {
    const combined=(canonical:string[],manual:string[]|undefined)=>[...new Set([...canonical,...(manual??[])])];
    const ids=kind==="source"?combined(item.source_ids,item.assigned_source_ids):
      kind==="gap"?combined(item.gap_ids,item.assigned_gap_ids):
      kind==="requirement"?combined(item.requirement_ids,item.assigned_requirement_ids):
      kind==="country"?item.country_codes:[item.record_type];
    if(!ids?.length){add("unlinked","Independent / Unlinked",item);continue;}
    for(const id of ids) {
      const label=kind==="source"?labels?.source?.[id]:
        kind==="gap"?labels?.gap?.[id]:
        kind==="requirement"?labels?.requirement?.[id]:
        kind==="country"?labels?.country?.[id]:id;
      add(kind+":"+id,label||id,item);
    }
  }
  return [...groups.values()].sort((a,b)=>a.key==="unlinked"?1:b.key==="unlinked"?-1:a.label.localeCompare(b.label));
}
