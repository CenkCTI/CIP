export const reportInsertSources = [
  ["research_notes", "id,title,content,updated_at"],
  [
    "evidence",
    "id,title,type,description,source_url,collection_date,tags,created_at",
  ],
  ["timeline_events", "id,event_name,description,event_date,created_at"],
  [
    "project_tasks",
    "id,task_name,description,status,priority,deadline,updated_at",
  ],
  [
    "threat_actors",
    "id,name,aliases,country,motivations,description,updated_at",
  ],
  ["campaigns", "id,name,description,start_date,end_date,targets,updated_at"],
  ["indicators", "id,value,type,confidence,source,tags,first_seen,last_seen"],
  ["malware", "id,name,family,description,behavior,updated_at"],
  [
    "cves",
    "id,cve_id,severity,description,affected_product,exploit_status,updated_at",
  ],
  [
    "mitre_techniques",
    "id,technique_id,technique_name,tactic,description,updated_at",
  ],
] as const;
