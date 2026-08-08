import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { entityIdSchema, entityKindSchema } from "@/lib/techint/entities/schema";
import {
  createTechnicalEntityFromAssertionWorkflow,
  linkTechnicalEntityAssertionWorkflow,
} from "@/lib/techint/entities/trusted-client";
import { normalizeEntityLookup } from "@/lib/techint/entities/normalization";
import type { TechnicalEntityKind } from "@/lib/techint/entities/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const deterministicKinds = new Set<TechnicalEntityKind>(["CVE", "INDICATOR", "ATTACK_TECHNIQUE"]);
const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("LINK_EXISTING"),
    entityKind: entityKindSchema,
    normalizedValue: z.string().trim().min(1).max(500),
    entityId: entityIdSchema,
    rememberAlias: z.boolean().default(false),
  }).strict(),
  z.object({
    action: z.literal("CREATE_NEW"),
    entityKind: entityKindSchema,
    normalizedValue: z.string().trim().min(1).max(500),
    canonicalName: z.string().trim().min(1).max(500),
    rememberAlias: z.boolean().default(false),
  }).strict(),
]);

export async function POST(request: Request) {
  try {
    const input = bodySchema.parse(await request.json());
    if (deterministicKinds.has(input.entityKind)) {
      return NextResponse.json({ error: "Deterministic entities must use safe reconciliation." }, { status: 400 });
    }
    const { supabase, user } = await requireUser();
    const normalizedValue = normalizeEntityLookup(input.normalizedValue);
    const [{ data: assertions, error: assertionError }, { data: resolutions, error: resolutionError }] = await Promise.all([
      supabase
        .from("technical_signal_entity_assertions")
        .select("id,entity_kind,normalized_value,display_value,created_at")
        .eq("entity_kind", input.entityKind)
        .order("created_at", { ascending: true })
        .limit(500),
      supabase
        .from("technical_entity_assertion_resolutions")
        .select("assertion_id,status")
        .limit(500),
    ]);
    if (assertionError || resolutionError) return NextResponse.json({ error: "Unable to load the entity review group." }, { status: 400 });
    const statusByAssertion = new Map(((resolutions ?? []) as Array<{ assertion_id: string; status: string }>).map((row) => [row.assertion_id, row.status]));
    const group = ((assertions ?? []) as Array<{ id: string; entity_kind: TechnicalEntityKind; normalized_value: string; display_value: string }>).filter((assertion) => {
      const status = statusByAssertion.get(assertion.id);
      return normalizeEntityLookup(assertion.normalized_value || assertion.display_value) === normalizedValue && (!status || status === "NEEDS_REVIEW");
    }).slice(0, 250);
    if (!group.length) return NextResponse.json({ error: "No unresolved assertions remain in this exact group." }, { status: 404 });

    let entityId: string;
    let linked = 0;
    let failed = 0;
    let startIndex = 0;

    if (input.action === "CREATE_NEW") {
      const first = group[0];
      const result = await createTechnicalEntityFromAssertionWorkflow({
        p_actor: user.id,
        p_assertion_id: first.id,
        p_canonical_name: input.canonicalName,
        p_remember_alias: input.rememberAlias,
      });
      entityId = result.entity_id;
      linked = 1;
      startIndex = 1;
    } else {
      const { data: entity, error: entityError } = await supabase
        .from("technical_entities")
        .select("id,entity_kind,status")
        .eq("id", input.entityId)
        .eq("entity_kind", input.entityKind)
        .eq("status", "ACTIVE")
        .single();
      if (entityError || !entity) return NextResponse.json({ error: "The selected canonical entity is unavailable." }, { status: 400 });
      entityId = input.entityId;
    }

    for (let index = startIndex; index < group.length; index += 1) {
      try {
        await linkTechnicalEntityAssertionWorkflow({
          p_actor: user.id,
          p_assertion_id: group[index].id,
          p_entity_id: entityId,
          p_remember_alias: input.action === "LINK_EXISTING" && index === 0 ? input.rememberAlias : false,
        });
        linked += 1;
      } catch {
        failed += 1;
      }
    }

    revalidatePath("/techint/entities");
    return NextResponse.json({
      entityId,
      matched: group.length,
      linked,
      failed,
      truncated: group.length === 250,
      aliasRemembered: input.rememberAlias,
    });
  } catch {
    return NextResponse.json({ error: "Entity group resolution failed safely." }, { status: 400 });
  }
}
