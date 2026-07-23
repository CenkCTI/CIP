import { aiWorkflows, type AiWorkflow } from "./config";

export type WorkflowContract = {
  workflow: AiWorkflow;
  topLevelKeys: string[];
  text: string;
};

const sourceRef = `source_ref is optional or null. When present it is an object with exactly: kind string, id UUID string copied only from authorized source IDs.`;

export const workflowContracts: Record<AiWorkflow, WorkflowContract> = {
  summarize_research: {
    workflow: "summarize_research",
    topLevelKeys: ["title_suggestion", "executive_summary", "key_findings", "intelligence_gaps", "caveats", "cited_source_note_ids", "disclaimer"],
    text: `Return exactly one JSON object with no additional keys:
{
  "title_suggestion": string, max 160 chars, required,
  "executive_summary": string, max 4000 chars, required,
  "key_findings": array of strings, max 12 items, each max 500 chars, required,
  "intelligence_gaps": array of strings, max 10 items, each max 500 chars, required,
  "caveats": array of strings, max 10 items, each max 500 chars, required,
  "cited_source_note_ids": array of UUID strings, max 20 items, required; copy only authorized research note IDs from source data; use [] when none,
  "disclaimer": string, max 500 chars, required, must state AI-generated suggestions require analyst review
}`,
  },
  extract_indicators: {
    workflow: "extract_indicators",
    topLevelKeys: ["indicators", "warnings", "disclaimer"],
    text: `Return exactly one JSON object with no additional keys:
{
  "indicators": array, max 30 items, required. Each item is an object with exactly:
    "value": string max 500 chars,
    "type": one of "IP", "DOMAIN", "URL", "HASH", "EMAIL", "FILE", "REGISTRY",
    "confidence": one of "LOW", "MEDIUM", "HIGH",
    "evidence_context": string max 500 chars,
    "source_ref": optional or null; ${sourceRef}
  "warnings": array of strings, max 10 items, each max 400 chars, required,
  "disclaimer": string, max 500 chars, required
}`,
  },
  extract_entities: {
    workflow: "extract_entities",
    topLevelKeys: ["entities", "warnings", "disclaimer"],
    text: `Return exactly one JSON object with no additional keys:
{
  "entities": array, max 25 items, required. Each item is an object with exactly:
    "entity_type": one of "actors", "malware", "campaigns", "cves",
    "name": string max 180 chars; CVEs must use CVE-YYYY-NNNN+ format when entity_type is "cves",
    "confidence": one of "LOW", "MEDIUM", "HIGH",
    "evidence_excerpt": string max 500 chars,
    "caveats": array of strings, max 5 items, each max 300 chars,
    "source_ref": optional or null; ${sourceRef}
  "warnings": array of strings, max 10 items, each max 400 chars, required,
  "disclaimer": string, max 500 chars, required
}`,
  },
  suggest_mitre_mapping: {
    workflow: "suggest_mitre_mapping",
    topLevelKeys: ["mappings", "warnings", "disclaimer"],
    text: `Return exactly one JSON object with no additional keys:
{
  "mappings": array, max 20 items, required. Each item is an object with exactly:
    "technique_id": MITRE ATT&CK technique identifier string like "T1059" or "T1059.001"; never use or invent database UUIDs,
    "technique_name": string max 180 chars,
    "confidence": one of "LOW", "MEDIUM", "HIGH",
    "reasoning": string max 600 chars,
    "evidence_excerpt": string max 500 chars,
    "source_record_ids": array of UUID strings, max 10 items, copied only from authorized campaign/malware/source IDs
  "warnings": array of strings, max 10 items, each max 400 chars, required,
  "disclaimer": string, max 500 chars, required
}`,
  },
  generate_report_draft: {
    workflow: "generate_report_draft",
    topLevelKeys: ["title", "report_type_suggestion", "sections", "caveats", "disclaimer"],
    text: `Return exactly one JSON object with no additional keys:
{
  "title": string max 180 chars, required,
  "report_type_suggestion": one of "TECHNICAL", "EXECUTIVE", "CTI", "AI_SECURITY", "OSINT",
  "sections": array, min 1 item and max 12 items, required. Each item is an object with exactly:
    "heading": string max 120 chars,
    "paragraphs": array of strings, min 1 item and max 6 items, each max 2000 chars,
    "source_refs": array, min 1 item and max 20 items. Each factual section must cite at least one allowed source_ref. Each source_ref is an object with exactly: kind one of "research_note", "evidence", "timeline_event", "task", "threat_actor", "campaign", "indicator", "malware", "cve", "mitre_technique"; id UUID string copied exactly from the authorized source IDs. Never reconstruct IDs from memory
  "caveats": array of strings, max 10 items, each max 500 chars, required,
  "disclaimer": string, max 500 chars, required
}
Use only facts present in authorized source data. Do not invent timestamps, durations, attribution, causality, compromise, execution, or impact. Keep uncertain claims qualified.`,
  },
  translate_document: {
    workflow: "translate_document",
    topLevelKeys: ["translated_text", "target_language", "source_record_id", "preservation_warnings", "disclaimer"],
    text: `Return exactly one JSON object with no additional keys:
{
  "translated_text": string max 50000 chars, required,
  "target_language": string max 60 chars, required and must match the requested target language,
  "source_record_id": UUID string copied only from the one authorized source record ID,
  "preservation_warnings": array of strings, max 20 items, each max 500 chars, required; include warnings for any protected IOC/hash/CVE/MITRE/URL/email/file/registry/code token preservation concern,
  "disclaimer": string max 500 chars, required
}`,
  },
};

export function getWorkflowContract(workflow: AiWorkflow) {
  return workflowContracts[workflow];
}

export function workflowContractText(workflow: AiWorkflow) {
  const contract = getWorkflowContract(workflow);
  return `WORKFLOW CONTRACT FOR ${workflow}\n${contract.text}\nNo additional keys are allowed at any object level. Output exactly one JSON object without Markdown, code fences, comments, or commentary. If no supported item exists, return an empty array for that array and still include every required string/disclaimer field.`;
}

export function allWorkflowNamesExcept(workflow: AiWorkflow) {
  return aiWorkflows.filter((name) => name !== workflow);
}
