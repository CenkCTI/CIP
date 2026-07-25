export const demoBanner = "Demo data is synthetic. Changes are not saved.";
export const demoData = {
 project: { name: "Synthetic Intrusion Review: Example Harbor", status: "DEMO_ONLY", owner: "Fictional Demo Team" },
 dashboard: { notes: 3, evidence: 3, tasks: 4, ctiRecords: 8 },
 notes: [
  { id:"NOTE_001", title:"Initial triage", body:"Fictional phishing lure references update.example.com and 198.51.100.42.", tags:["phishing","demo"]},
  { id:"NOTE_002", title:"Host observations", body:"Synthetic host logged C:\\Demo\\loader.exe and registry Run key persistence.", tags:["endpoint"]},
  { id:"NOTE_003", title:"Analyst caveat", body:"All actors, malware, CVEs, and incidents in this fixture are fictional.", tags:["caveat"]}
 ],
 evidence: [
  { id:"EVID_001", title:"Email header excerpt", type:"text", source:"example.com", storage:"demo metadata only; no storage path"},
  { id:"EVID_002", title:"Sandbox summary", type:"metadata", source:"malware.example", storage:"demo metadata only; no signed URL"},
  { id:"EVID_003", title:"Firewall event rollup", type:"log", source:"corp.example", storage:"demo metadata only; no production identifier"}
 ],
 timeline:[{id:"TIME_001",date:"2026-07-01",title:"Synthetic lure received"},{id:"TIME_002",date:"2026-07-02",title:"Demo beacon blocked"},{id:"TIME_003",date:"2026-07-03",title:"Fictional containment complete"}],
 tasks:[{id:"TASK_001",title:"Validate indicators",status:"Open"},{id:"TASK_002",title:"Draft stakeholder summary",status:"In Progress"},{id:"TASK_003",title:"Review ATT&CK mapping",status:"Open"},{id:"TASK_004",title:"Create account to save real work",status:"Demo Only"}],
 cti:{ actors:[{id:"ACTOR_001",name:"Fictional Harbor Lynx",attribution:"Synthetic; not real intelligence"}], malware:[{id:"MAL_001",name:"DemoDrift",family:"Fictional loader"}], campaigns:[{id:"CAMP_001",name:"Example Harbor",description:"Synthetic campaign for product demo"}], cves:[{id:"CVE_001",cve:"CVE-2099-0001",description:"Fictional CVE label for UI demonstration"}], indicators:["198.51.100.42","203.0.113.7","update.example.com"], mitre:["T1059","T1566.001"] },
 graph:{ nodes:["ACTOR_001","CAMP_001","MAL_001","198.51.100.42","T1566.001"], edges:[["ACTOR_001","CAMP_001"],["CAMP_001","MAL_001"],["MAL_001","198.51.100.42"],["CAMP_001","T1566.001"]] },
 report:{ title:"Synthetic Example Harbor Brief", sections:["Executive summary","Indicators to validate","ATT&CK hypothesis","Analyst caveats"]}
} as const;
