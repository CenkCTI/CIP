"use server";

import { z } from "zod";

import { executeIndicatorEnrichment } from "@/lib/enrichment/service";

const uuid = z.string().uuid();
const providerId = z.string().trim().min(1).max(80).regex(/^[a-z0-9_\-]+$/);

export async function runIndicatorEnrichment(
  projectId: string,
  indicatorId: string,
  provider: string,
) {
  const parsed = z
    .object({ projectId: uuid, indicatorId: uuid, provider: providerId })
    .safeParse({ projectId, indicatorId, provider });
  if (!parsed.success) {
    return { ok: false as const, code: "INVALID_REQUEST", error: "Invalid enrichment request." };
  }
  return executeIndicatorEnrichment(parsed.data.projectId, parsed.data.indicatorId, parsed.data.provider);
}
