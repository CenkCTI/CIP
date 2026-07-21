import { z } from "zod";

export const evidenceTypes = ["SCREENSHOT", "PDF", "ARTICLE", "TWEET", "FILE", "LOG", "PCAP"] as const;
export const taskStatuses = ["TODO", "IN_PROGRESS", "COMPLETED"] as const;
export const taskPriorities = ["LOW", "MEDIUM", "HIGH"] as const;

const tags = z.preprocess(
  (v) => typeof v === "string" ? v.split(",").map((t) => t.trim()).filter(Boolean) : v,
  z.array(z.string().trim().min(1).max(40)).max(20),
).default([]);

export const noteSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(160),
  content: z.string().max(50000).default(""),
  tags,
});

export const requiredUuidSchema = z.string().trim().uuid();
export const optionalUuidSchema = z.preprocess((v) => v === "" ? null : v, z.string().uuid().nullable().optional());

const httpUrl = z.string().trim().optional().transform((v) => v || null).refine((v) => {
  if (!v) return true;
  try { return ["http:", "https:"].includes(new URL(v).protocol); } catch { return false; }
}, "Use an http or https URL");

export const evidenceMetadataSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(180),
  type: z.enum(evidenceTypes),
  description: z.string().max(10000).default(""),
  source_url: httpUrl,
  collection_date: z.string().min(1).transform((v) => new Date(v).toISOString()),
  tags,
});

export const evidenceFinalizeSchema = evidenceMetadataSchema.extend({
  storage_path: z.string().min(1),
  original_file_name: z.string().min(1).max(255),
  mime_type: z.string().min(1).max(160),
  file_size: z.coerce.number().int().min(1).max(20 * 1024 * 1024),
});

export const evidenceReplacementSchema = z.object({
  storage_path: z.string().min(1),
  original_file_name: z.string().min(1).max(255),
  mime_type: z.string().min(1).max(160),
  file_size: z.coerce.number().int().min(1).max(20 * 1024 * 1024),
});

export const evidenceUrlOnlySchema = evidenceMetadataSchema.superRefine((v, ctx) => {
  if ((v.type === "ARTICLE" || v.type === "TWEET") && !v.source_url) {
    ctx.addIssue({ code: "custom", message: "Source URL is required for ARTICLE and TWEET evidence." });
  }
});

export const timelineSchema = z.object({
  event_name: z.string().trim().min(1, "Event name is required").max(180),
  event_date: z.string().min(1).transform((v) => new Date(v).toISOString()),
  description: z.string().max(10000).default(""),
  related_entity_type: z.string().trim().optional().transform((v) => v || null),
  related_entity_id: optionalUuidSchema.transform((v) => v ?? null),
});

export const taskSchema = z.object({
  task_name: z.string().trim().min(1, "Task name is required").max(180),
  description: z.string().max(10000).default(""),
  status: z.enum(taskStatuses),
  priority: z.enum(taskPriorities),
  assigned_user_id: optionalUuidSchema.transform((v) => v ?? null),
  deadline: z.string().optional().transform((v) => v ? new Date(v).toISOString() : null),
});

export const uploadAuthorizeSchema = evidenceMetadataSchema.extend({
  file_name: z.string().min(1).max(255),
  mime_type: z.string().min(1).max(160),
  file_size: z.coerce.number().int().min(1).max(20 * 1024 * 1024),
});

export function sanitizeFileName(name: string) {
  return name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+(?=\.)/g, "").replace(/-+/g, "-").replace(/^[-.]+|[-.]+$/g, "").slice(0, 120) || "evidence-file";
}
export function buildEvidencePath(userId: string, projectId: string, fileName: string, uuid = crypto.randomUUID()) { return `${userId}/${projectId}/${uuid}-${sanitizeFileName(fileName)}`; }
export function validateUpload(file: { name: string; type: string; size: number }) {
  const ext = file.name.toLowerCase().match(/\.[^.]+$/)?.[0];
  const allowed = new Map([[".png", ["image/png"]], [".jpg", ["image/jpeg"]], [".jpeg", ["image/jpeg"]], [".pdf", ["application/pdf"]], [".pcap", ["application/vnd.tcpdump.pcap", "application/octet-stream"]], [".log", ["text/plain", "text/x-log", "application/octet-stream"]], [".txt", ["text/plain"]]]);
  if (!ext || !allowed.has(ext)) return "Unsupported file extension.";
  if (!allowed.get(ext)!.includes(file.type)) return "File MIME type does not match the allowed category.";
  if (file.size > 20 * 1024 * 1024) return "Evidence files must be 20 MB or smaller.";
  return null;
}
export function isEvidencePathScoped(path: string, userId: string, projectId: string) { return path.startsWith(`${userId}/${projectId}/`) && path.split("/").length === 3; }
export function formObject(formData: FormData) { return Object.fromEntries(formData.entries()); }
