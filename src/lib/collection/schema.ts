import { z } from "zod";

import { sourceTypes } from "@/lib/sources/schema";

export const collectionRequirementStatuses = [
  "OPEN",
  "COLLECTING",
  "SATISFIED",
  "STOPPED",
] as const;

export const collectionPriorities = ["LOW", "MEDIUM", "HIGH"] as const;
export const sourceAnnotationTypes = ["HIGHLIGHT", "UNDERLINE", "REGION"] as const;

const uuid = z.string().uuid();
const nullableUuid = z.preprocess(
  (value) => (value === "" || value == null ? null : value),
  z.union([uuid, z.null()]),
);

const optionalText = (max: number) =>
  z.preprocess(
    (value) => (value == null ? "" : value),
    z
      .string()
      .trim()
      .max(max)
      .optional()
      .transform((value) => value || null),
  );

const nullableDate = z.preprocess(
  (value) => (value === "" || value == null ? null : value),
  z
    .union([z.string(), z.null()])
    .refine(
      (value) => value === null || !Number.isNaN(new Date(String(value)).getTime()),
      "Geçerli bir tarih kullanın.",
    )
    .transform((value) => (value === null ? null : new Date(value).toISOString())),
);

export const collectionRequirementSchema = z
  .object({
    requirement: z
      .string()
      .trim()
      .min(5, "Ne toplanması gerektiğini açıklayın.")
      .max(4000),
    rationale: optionalText(4000),
    priority: z.enum(collectionPriorities).default("MEDIUM"),
    gap_ids: z.array(uuid).max(50).default([]),
  })
  .strict();

export const collectionRequirementUpdateSchema = z
  .object({
    requirement: z.string().trim().min(5).max(4000),
    rationale: optionalText(4000),
    priority: z.enum(collectionPriorities),
    status: z.enum(collectionRequirementStatuses),
    gap_ids: z.array(uuid).max(50).default([]),
  })
  .strict();

export const sourceCollectionLinkSchema = z
  .object({
    source_id: uuid,
    gap_ids: z.array(uuid).max(50).default([]),
    requirement_ids: z.array(uuid).max(50).default([]),
  })
  .strict();

export const sourceNoteSchema = z
  .object({
    source_id: uuid,
    body: z.string().trim().min(1, "Not boş olamaz.").max(20000),
  })
  .strict();

export const sourceUrlCreateSchema = z
  .object({
    title: z.string().trim().min(1, "Kaynak başlığı gereklidir.").max(240),
    source_type: z.enum(sourceTypes),
    publisher: optionalText(240),
    url: z
      .string()
      .trim()
      .max(2048)
      .url("Geçerli bir HTTP/HTTPS URL girin.")
      .refine((value) => {
        const parsed = new URL(value);
        return (
          ["http:", "https:"].includes(parsed.protocol) &&
          !parsed.username &&
          !parsed.password
        );
      }, "URL gömülü kullanıcı adı veya parola içeremez."),
    published_at: nullableDate.default(null),
    collection_rationale: z
      .string()
      .trim()
      .min(3, "Bu kaynağın neden toplandığını açıklayın.")
      .max(4000),
    description: z.string().trim().max(10000).optional().default(""),
    gap_ids: z.array(uuid).max(50).default([]),
    requirement_ids: z.array(uuid).max(50).default([]),
  })
  .strict();

export const sourceFileDraftSchema = z
  .object({
    title: z.string().trim().min(1, "Kaynak başlığı gereklidir.").max(240),
    source_type: z.enum(sourceTypes),
    publisher: optionalText(240),
    published_at: nullableDate.default(null),
    collection_rationale: z
      .string()
      .trim()
      .min(3, "Bu kaynağın neden toplandığını açıklayın.")
      .max(4000),
    description: z.string().trim().max(10000).optional().default(""),
    gap_ids: z.array(uuid).max(50).default([]),
    requirement_ids: z.array(uuid).max(50).default([]),
    file_name: z.string().trim().min(1).max(255),
    mime_type: z.string().trim().max(255).optional().default(""),
    file_size: z.number().int().positive().max(50 * 1024 * 1024),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

export const sourceFileFinalizeSchema = z
  .object({
    source_id: uuid,
    asset_id: uuid,
    storage_path: z.string().min(1).max(1200),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    file_size: z.number().int().positive().max(50 * 1024 * 1024),
    mime_type: z.string().trim().max(255).optional().default(""),
  })
  .strict();

export const sourceFileCancelSchema = z
  .object({
    source_id: uuid,
    asset_id: uuid,
    storage_path: z.string().min(1).max(1200),
  })
  .strict();

export const annotationRectSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().gt(0).max(1),
    height: z.number().gt(0).max(1),
  })
  .superRefine((value, ctx) => {
    if (value.x + value.width > 1.0001) {
      ctx.addIssue({ code: "custom", message: "Annotation rectangle exceeds page width." });
    }
    if (value.y + value.height > 1.0001) {
      ctx.addIssue({ code: "custom", message: "Annotation rectangle exceeds page height." });
    }
  });

export const sourceAnnotationCreateSchema = z
  .object({
    source_id: uuid,
    asset_id: uuid,
    annotation_type: z.enum(sourceAnnotationTypes),
    page_number: z.number().int().min(1).nullable().default(null),
    rects: z.array(annotationRectSchema).max(100).default([]),
    selected_text: optionalText(20000),
    comment: optionalText(10000),
    gap_ids: z.array(uuid).max(50).default([]),
    requirement_ids: z.array(uuid).max(50).default([]),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.selected_text && !value.comment && value.rects.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "Annotation must contain a selection, region or analyst comment.",
      });
    }
  });

export const sourceAnnotationUpdateSchema = z
  .object({
    comment: optionalText(10000),
    gap_ids: z.array(uuid).max(50).default([]),
    requirement_ids: z.array(uuid).max(50).default([]),
  })
  .strict();

export const idSchema = uuid;

export function formUuidArray(formData: FormData, name: string) {
  return formData
    .getAll(name)
    .map(String)
    .filter(Boolean);
}

export function requirementFormObject(formData: FormData) {
  return {
    requirement: formData.get("requirement"),
    rationale: formData.get("rationale") ?? "",
    priority: formData.get("priority") ?? "MEDIUM",
    gap_ids: formUuidArray(formData, "gap_ids"),
  };
}

export function requirementUpdateFormObject(formData: FormData) {
  return {
    ...requirementFormObject(formData),
    status: formData.get("status") ?? "OPEN",
  };
}

export function urlSourceFormObject(formData: FormData) {
  return {
    title: formData.get("title"),
    source_type: formData.get("source_type") ?? "OTHER",
    publisher: formData.get("publisher") ?? "",
    url: formData.get("url"),
    published_at: formData.get("published_at") ?? "",
    collection_rationale: formData.get("collection_rationale"),
    description: formData.get("description") ?? "",
    gap_ids: formUuidArray(formData, "gap_ids"),
    requirement_ids: formUuidArray(formData, "requirement_ids"),
  };
}

export function safeSourceExtension(fileName: string) {
  const match = fileName.toLowerCase().match(/\.([a-z0-9]{1,12})$/);
  return match ? `.${match[1]}` : "";
}

export function isPreviewableMime(mime: string, fileName: string) {
  const normalized = mime.toLowerCase();
  const ext = safeSourceExtension(fileName);
  return (
    normalized === "application/pdf" ||
    normalized ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    normalized.startsWith("image/png") ||
    normalized.startsWith("image/jpeg") ||
    normalized.startsWith("text/") ||
    ["application/json"].includes(normalized) ||
    [".pdf", ".png", ".jpg", ".jpeg", ".txt", ".md", ".json", ".csv", ".log", ".docx"].includes(ext)
  );
}

export type CollectionRequirementInput = z.infer<typeof collectionRequirementSchema>;
export type SourceAnnotationInput = z.infer<typeof sourceAnnotationCreateSchema>;
