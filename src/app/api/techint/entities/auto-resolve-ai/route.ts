import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { AiError } from "@/lib/ai/client";
import { byokChat } from "@/lib/ai/byok/client";
import { safeAiErrorMessage } from "@/lib/ai/byok/errors";
import { BYOK_COOKIE, decryptCredential, type ByokCredential } from "@/lib/ai/byok/vault";
import { requireUser } from "@/lib/auth";
import { buildEntityAiMessages, entityAiGroupSchema, parseEntityAiResponse } from "@/lib/techint/entities/ai-resolver";
import { evaluateAiAutoResolution } from "@/lib/techint/entities/auto-resolution";
import { groupUnresolvedAssertions, shortlistEntityCandidates } from "@/lib/techint/entities/grouping";
import {
  listTechnicalEntities,
  listTechnicalEntityAssertions,
  listTechnicalEntityResolutionsForAssertions,
  listTechnicalObservationLabels,
  listTechnicalSignalLabels,
} from "@/lib/techint/entities/queries";
import { aiResolveTechnicalEntityAssertionWorkflow } from "@/lib/techint/entities/trusted-client";
import type { TechnicalEntityKind } from "@/lib/techint/entities/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ limit: z.coerce.number().int().min(1).max(8).default(8) }).strict();
const deterministicKinds = new Set<TechnicalEntityKind>(["CVE", "INDICATOR", "ATTACK_TECHNIQUE"]);

function safeError(error: unknown) {
  const code = error instanceof AiError ? error.code : error instanceof Error ? error.message : "entity_ai_auto_resolution_failed";
  const known = [
    "byok_required",
    "byok_expired",
    "byok_binding_mismatch",
    "timeout",
    "provider_rate_limited",
    "provider_unreachable",
    "unsupported_model",
    "nvidia_output_exhausted",
  ];
  const message = known.includes(code) ? safeAiErrorMessage(code) : "AI auto-resolution could not be completed safely.";
  return NextResponse.json({ error: message, code }, { status: code === "provider_rate_limited" ? 429 : 400 });
}

export async function POST(request: Request) {
  try {
    const input = bodySchema.parse(await request.json().catch(() => ({})));
    const { supabase, user } = await requireUser();
    const [{ data: assertionRows, error: assertionError }, { data: entityRows, error: entityError }] = await Promise.all([
      listTechnicalEntityAssertions(supabase, 500),
      listTechnicalEntities(supabase, 300),
    ]);
    if (assertionError || entityError) throw new Error("entity_ai_context_unavailable");

    const assertions = (assertionRows ?? []) as Array<{
      id: string;
      entity_kind: TechnicalEntityKind;
      display_value: string;
      normalized_value: string;
      semantic_role?: string | null;
      source_observation_id?: string | null;
      signal_id?: string | null;
    }>;
    const resolutionResult = await listTechnicalEntityResolutionsForAssertions(supabase, assertions.map((assertion) => assertion.id));
    if (resolutionResult.error) throw new Error("entity_ai_context_unavailable");
    const resolutions = (resolutionResult.data ?? []) as Array<{ assertion_id: string; status: string }>;
    const entities = (entityRows ?? []) as Array<{
      id: string;
      entity_kind: TechnicalEntityKind;
      canonical_name: string;
      canonical_normalized: string;
      status?: string | null;
    }>;

    const groups = groupUnresolvedAssertions(assertions, resolutions)
      .filter((group) => !deterministicKinds.has(group.entityKind))
      .slice(0, input.limit);
    if (!groups.length) {
      return NextResponse.json({
        provider: null,
        model: null,
        groups_analyzed: 0,
        auto_resolved: 0,
        assertions_linked: 0,
        review_remaining: 0,
        rejected_by_safety_gate: 0,
        unsure: 0,
        generic_labels: 0,
        conflicts: 0,
        failed_writes: 0,
      });
    }

    const observationIds = [...new Set(groups.flatMap((group) => group.sourceObservationIds))].slice(0, 500);
    const signalIds = [...new Set(groups.flatMap((group) => group.signalIds))].slice(0, 500);
    const [{ data: observationRows }, { data: signalRows }] = await Promise.all([
      listTechnicalObservationLabels(supabase, observationIds),
      listTechnicalSignalLabels(supabase, signalIds),
    ]);
    const observationById = new Map(((observationRows ?? []) as Array<Record<string, unknown>>).map((row) => [String(row.id), row]));
    const signalById = new Map(((signalRows ?? []) as Array<Record<string, unknown>>).map((row) => [String(row.id), row]));

    const contextGroups = groups.map((group) => ({
      ...group,
      sourceSystems: [...new Set(group.sourceObservationIds.map((id) => String(observationById.get(id)?.source_system ?? "")).filter(Boolean))].slice(0, 8),
      sampleSignalTitles: [...new Set(group.signalIds.map((id) => String(signalById.get(id)?.title ?? "")).filter(Boolean))].slice(0, 3),
    }));
    const candidateLists = contextGroups.map((group) => shortlistEntityCandidates(group, entities, 8));
    const aiGroups = contextGroups.map((group, index) => entityAiGroupSchema.parse({
      entityKind: group.entityKind,
      displayValue: group.displayValue,
      normalizedValue: group.normalizedValue,
      occurrenceCount: Math.min(group.occurrenceCount, 500),
      sourceSystems: group.sourceSystems,
      semanticRoles: group.semanticRoles.slice(0, 8),
      sampleSignalTitles: group.sampleSignalTitles,
      candidates: candidateLists[index].map((candidate) => ({ id: candidate.id, canonicalName: candidate.canonicalName })),
    }));

    const cookie = (await cookies()).get(BYOK_COOKIE)?.value;
    if (!cookie) throw new AiError("byok_required");
    let credential: ByokCredential;
    try {
      credential = decryptCredential(cookie, { kind: "user", id: user.id });
    } catch (error) {
      throw new AiError(error instanceof Error ? error.message : "byok_required");
    }

    const content = await byokChat(
      credential.providerId,
      credential.model,
      credential.apiKey,
      buildEntityAiMessages(aiGroups),
      "generation",
    );
    const decisions = parseEntityAiResponse(content, aiGroups);

    let autoResolved = 0;
    let assertionsLinked = 0;
    let genericLabels = 0;
    let conflicts = 0;
    let unsure = 0;
    let rejected = 0;
    let failedWrites = 0;
    const outcomes: Array<{ groupKey: string; displayValue: string; status: "AUTO_RESOLVED" | "REVIEW"; reason: string }> = [];

    for (let index = 0; index < contextGroups.length; index += 1) {
      const group = contextGroups[index];
      const decision = decisions[index];
      const candidates = candidateLists[index];
      const candidateEntity = decision.candidateEntityId
        ? entities.find((entity) => entity.id === decision.candidateEntityId) ?? null
        : null;
      const gate = evaluateAiAutoResolution({
        group,
        suggestion: decision,
        candidates,
        candidateEntity: candidateEntity
          ? { id: candidateEntity.id, entityKind: candidateEntity.entity_kind, status: candidateEntity.status ?? "ACTIVE" }
          : null,
      });

      if (!gate.eligible) {
        if (gate.reason === "GENERIC_LABEL") genericLabels += 1;
        else if (gate.reason === "COMPETING_CANDIDATES" || gate.reason === "CONTEXT_CONFLICT") conflicts += 1;
        else if (decision.decision === "UNSURE" || decision.confidence !== "HIGH") unsure += 1;
        else rejected += 1;
        outcomes.push({ groupKey: group.key, displayValue: group.displayValue, status: "REVIEW", reason: gate.reason });
        continue;
      }

      let linkedInGroup = 0;
      for (const assertionId of group.assertionIds.slice(0, 250)) {
        try {
          await aiResolveTechnicalEntityAssertionWorkflow({
            p_actor: user.id,
            p_assertion_id: assertionId,
            p_entity_id: gate.entityId,
            p_provider: credential.providerId,
            p_model: credential.model,
            p_safety_checks: {
              candidateUnique: true,
              candidateStrong: true,
              kindMatch: true,
              genericLabel: false,
              contextConflict: false,
              aliasTaught: false,
            },
          });
          linkedInGroup += 1;
          assertionsLinked += 1;
        } catch {
          failedWrites += 1;
        }
      }

      if (linkedInGroup > 0) {
        autoResolved += 1;
        outcomes.push({ groupKey: group.key, displayValue: group.displayValue, status: "AUTO_RESOLVED", reason: "SAFE_HIGH_MATCH" });
      } else {
        rejected += 1;
        outcomes.push({ groupKey: group.key, displayValue: group.displayValue, status: "REVIEW", reason: "WRITE_FAILED_SAFE" });
      }
    }

    revalidatePath("/techint/entities");
    return NextResponse.json({
      provider: credential.providerId,
      model: credential.model,
      groups_analyzed: contextGroups.length,
      auto_resolved: autoResolved,
      assertions_linked: assertionsLinked,
      review_remaining: contextGroups.length - autoResolved,
      rejected_by_safety_gate: rejected,
      unsure,
      generic_labels: genericLabels,
      conflicts,
      failed_writes: failedWrites,
      outcomes,
      disclaimer: "AI confidence alone never authorizes a write. Only current unresolved groups that passed all server-side safety gates were linked. No canonical entity or alias was created.",
    });
  } catch (error) {
    return safeError(error);
  }
}
