import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { AiError } from "@/lib/ai/client";
import { byokChat } from "@/lib/ai/byok/client";
import { safeAiErrorMessage } from "@/lib/ai/byok/errors";
import { BYOK_COOKIE, decryptCredential, type ByokCredential } from "@/lib/ai/byok/vault";
import { buildEntityAiMessages, entityAiGroupSchema, parseEntityAiResponse, type EntityAiSuggestion } from "@/lib/techint/entities/ai-resolver";
import { chunkEntityAiItems, ENTITY_AI_MAX_RUN_GROUPS } from "@/lib/techint/entities/ai-batch";
import { groupUnresolvedAssertions, shortlistEntityCandidates } from "@/lib/techint/entities/grouping";
import { normalizeEntityLookup } from "@/lib/techint/entities/normalization";
import {
  listTechnicalEntitiesForKinds,
  listTechnicalEntityAssertions,
  listTechnicalEntityResolutionsForAssertions,
  listTechnicalObservationLabels,
  listTechnicalSignalLabels,
} from "@/lib/techint/entities/queries";
import type { TechnicalEntityKind } from "@/lib/techint/entities/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ limit: z.coerce.number().int().min(0).max(ENTITY_AI_MAX_RUN_GROUPS).default(8) }).strict();
const deterministicKinds = new Set<TechnicalEntityKind>(["CVE", "INDICATOR", "ATTACK_TECHNIQUE"]);

function safeError(error: unknown) {
  const code = error instanceof AiError ? error.code : error instanceof Error ? error.message : "entity_ai_failed";
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
  const message = known.includes(code) ? safeAiErrorMessage(code) : "AI entity suggestions could not be generated safely.";
  return NextResponse.json({ error: message, code }, { status: code === "provider_rate_limited" ? 429 : 400 });
}

export async function POST(request: Request) {
  try {
    const parsed = bodySchema.parse(await request.json().catch(() => ({})));
    if (parsed.limit === 0) {
      return NextResponse.json({ suggestions: [], provider: null, model: null, groups_analyzed: 0, model_batches: 0 });
    }

    const { supabase, user } = await requireUser();
    const { data: assertionRows, error: assertionError } = await listTechnicalEntityAssertions(supabase, 500);
    if (assertionError) throw new Error("entity_ai_context_unavailable");

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
    const groups = groupUnresolvedAssertions(assertions, resolutions)
      .filter((group) => !deterministicKinds.has(group.entityKind))
      .slice(0, parsed.limit);
    if (!groups.length) {
      return NextResponse.json({ suggestions: [], provider: null, model: null, groups_analyzed: 0, model_batches: 0 });
    }

    const entityResult = await listTechnicalEntitiesForKinds(supabase, groups.map((group) => group.entityKind), 500);
    if (entityResult.error) throw new Error("entity_ai_context_unavailable");
    const entities = (entityResult.data ?? []) as Array<{
      id: string;
      entity_kind: TechnicalEntityKind;
      canonical_name: string;
      canonical_normalized: string;
      status?: string | null;
    }>;

    const observationIds = [...new Set(groups.flatMap((group) => group.sourceObservationIds))].slice(0, 500);
    const signalIds = [...new Set(groups.flatMap((group) => group.signalIds))].slice(0, 500);
    const [{ data: observationRows }, { data: signalRows }] = await Promise.all([
      listTechnicalObservationLabels(supabase, observationIds),
      listTechnicalSignalLabels(supabase, signalIds),
    ]);
    const observationById = new Map(((observationRows ?? []) as Array<Record<string, unknown>>).map((row) => [String(row.id), row]));
    const signalById = new Map(((signalRows ?? []) as Array<Record<string, unknown>>).map((row) => [String(row.id), row]));

    const aiGroups = groups.map((group) => entityAiGroupSchema.parse({
      entityKind: group.entityKind,
      displayValue: group.displayValue,
      normalizedValue: group.normalizedValue,
      occurrenceCount: Math.min(group.occurrenceCount, 500),
      sourceSystems: [...new Set(group.sourceObservationIds.map((id) => String(observationById.get(id)?.source_system ?? "")).filter(Boolean))].slice(0, 8),
      semanticRoles: group.semanticRoles.slice(0, 8),
      sampleSignalTitles: [...new Set(group.signalIds.map((id) => String(signalById.get(id)?.title ?? "")).filter(Boolean))].slice(0, 3),
      candidates: shortlistEntityCandidates(group, entities, 8).map((candidate) => ({ id: candidate.id, canonicalName: candidate.canonicalName })),
    }));

    const cookie = (await cookies()).get(BYOK_COOKIE)?.value;
    if (!cookie) throw new AiError("byok_required");
    let credential: ByokCredential;
    try {
      credential = decryptCredential(cookie, { kind: "user", id: user.id });
    } catch (error) {
      const code = error instanceof Error ? error.message : "byok_required";
      throw new AiError(code);
    }

    const decisions: EntityAiSuggestion[] = [];
    const batches = chunkEntityAiItems(aiGroups);
    for (const batch of batches) {
      const content = await byokChat(credential.providerId, credential.model, credential.apiKey, buildEntityAiMessages(batch), "generation");
      decisions.push(...parseEntityAiResponse(content, batch));
    }

    const suggestions = groups.map((group, index) => {
      const decision = decisions[index];
      if (decision.decision === "CREATE_NEW" && decision.proposedCanonicalName) {
        const proposedNormalized = normalizeEntityLookup(decision.proposedCanonicalName);
        const exactExisting = entities.filter((entity) =>
          entity.entity_kind === group.entityKind
          && entity.status !== "ARCHIVED"
          && normalizeEntityLookup(entity.canonical_name) === proposedNormalized,
        );
        if (exactExisting.length === 1) {
          return {
            groupKey: group.key,
            entityKind: group.entityKind,
            displayValue: group.displayValue,
            normalizedValue: group.normalizedValue,
            occurrenceCount: group.occurrenceCount,
            decision: "MATCH_EXISTING" as const,
            candidateEntityId: exactExisting[0].id,
            proposedCanonicalName: null,
            confidence: decision.confidence,
            rationale: `${decision.rationale} Server-side exact canonical-name validation found an existing entity with the proposed name.`,
          };
        }
        if (exactExisting.length > 1) {
          return {
            groupKey: group.key,
            entityKind: group.entityKind,
            displayValue: group.displayValue,
            normalizedValue: group.normalizedValue,
            occurrenceCount: group.occurrenceCount,
            decision: "UNSURE" as const,
            candidateEntityId: null,
            proposedCanonicalName: null,
            confidence: "LOW" as const,
            rationale: "The proposed canonical name matches multiple existing entities, so CİTEM requires analyst disambiguation.",
          };
        }
      }
      return {
        groupKey: group.key,
        entityKind: group.entityKind,
        displayValue: group.displayValue,
        normalizedValue: group.normalizedValue,
        occurrenceCount: group.occurrenceCount,
        ...decision,
      };
    });

    return NextResponse.json({
      provider: credential.providerId,
      model: credential.model,
      groups_analyzed: groups.length,
      model_batches: batches.length,
      suggestions,
      disclaimer: "AI suggestions are non-authoritative. No canonical entity, alias, resolution, Investigation record, match, or score was changed.",
    });
  } catch (error) {
    return safeError(error);
  }
}
