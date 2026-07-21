import { z } from "zod";
export const researchTypes = ["CTI","AI_SECURITY","OSINT","DFIR","MALWARE","VULN_RESEARCH","GEOPOLITICAL"] as const;
export const priorities = ["LOW","MEDIUM","HIGH","CRITICAL"] as const;
export const projectSchema = z.object({
  name: z.string().trim().min(2,"Name must be at least 2 characters").max(120),
  description: z.string().trim().max(2000).optional().default(""),
  research_type: z.enum(researchTypes),
  priority: z.enum(priorities),
  tags: z.preprocess((v) => typeof v === "string" ? v.split(",").map((t)=>t.trim()).filter(Boolean) : v, z.array(z.string().trim().min(1).max(40)).max(12)).default([]),
});
export type ProjectInput = z.infer<typeof projectSchema>;
export type Project = ProjectInput & { id: string; owner_id: string; created_at: string; updated_at: string };
export function parseProjectForm(formData: FormData) { return projectSchema.safeParse({ name: formData.get("name"), description: formData.get("description") ?? "", research_type: formData.get("research_type"), priority: formData.get("priority"), tags: formData.get("tags") ?? "" }); }
