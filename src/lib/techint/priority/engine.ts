export const GLOBAL_PRIORITY_ENGINE_VERSION = "2.3E-v1" as const;
export type GlobalPriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
export type PriorityReason = "CISA_KEV"|"CONFIRMED_ACTIVE_EXPLOITATION"|"EPSS_VERY_HIGH"|"EPSS_HIGH"|"EPSS_PERCENTILE_99"|"EPSS_PERCENTILE_95"|"TECHNICAL_SEVERITY_CRITICAL"|"TECHNICAL_SEVERITY_HIGH"|"TECHNICAL_SEVERITY_MEDIUM"|"FRESH_LT_24H"|"FRESH_LT_7D"|"MULTI_SOURCE_3_PLUS"|"MULTI_SOURCE"|"VENDOR_ADVISORY"|"MATERIAL_REVISION"|"HIGH_SOURCE_CONFIDENCE"|"NON_ACTIVE_LIFECYCLE";
export type PriorityInput = { kev?:boolean;activeExploitation?:boolean;epss?:number|null;epssPercentile?:number|null;technicalSeverity?:"CRITICAL"|"HIGH"|"MEDIUM"|"LOW"|"INFO"|null;ageHours:number;sourceCount?:number;vendorAdvisory?:boolean;materialRevision?:boolean;sourceConfidence?:number|null;active?:boolean };
export function evaluateGlobalPriority(input:PriorityInput){
 if(input.active===false)return result(0,["NON_ACTIVE_LIFECYCLE"]);let score=0;const reasons:PriorityReason[]=[];const add=(n:number,r:PriorityReason)=>{score+=n;reasons.push(r)};
 if(input.kev)add(25,"CISA_KEV");if(input.activeExploitation)add(20,"CONFIRMED_ACTIVE_EXPLOITATION");
 if((input.epss??0)>=.9)add(15,"EPSS_VERY_HIGH");else if((input.epss??0)>=.5)add(8,"EPSS_HIGH");
 if((input.epssPercentile??0)>=.99)add(10,"EPSS_PERCENTILE_99");else if((input.epssPercentile??0)>=.95)add(5,"EPSS_PERCENTILE_95");
 const severity={CRITICAL:15,HIGH:10,MEDIUM:5,LOW:0,INFO:0}[input.technicalSeverity??"INFO"];if(severity)add(severity,`TECHNICAL_SEVERITY_${input.technicalSeverity}` as PriorityReason);
 if(input.ageHours<24)add(10,"FRESH_LT_24H");else if(input.ageHours<168)add(5,"FRESH_LT_7D");
 if((input.sourceCount??0)>=3)add(10,"MULTI_SOURCE_3_PLUS");else if((input.sourceCount??0)>=2)add(7,"MULTI_SOURCE");if(input.vendorAdvisory)add(5,"VENDOR_ADVISORY");if(input.materialRevision)add(5,"MATERIAL_REVISION");if((input.sourceConfidence??0)>=80)add(5,"HIGH_SOURCE_CONFIDENCE");return result(Math.min(100,score),reasons);
}
function result(internalScore:number,reasonCodes:PriorityReason[]){const priority:GlobalPriority=internalScore>=70?"CRITICAL":internalScore>=50?"HIGH":internalScore>=30?"MEDIUM":internalScore>=15?"LOW":"INFO";return{priority,internalScore,reasonCodes,engineVersion:GLOBAL_PRIORITY_ENGINE_VERSION}}
