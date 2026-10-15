"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  createSourceClaimFromAnnotation,
  linkSourceClaimFromAnnotation,
  unlinkSourceClaimAssertion,
} from "@/app/projects/[id]/source-processing-actions";
import { mappingOrigins, type MappingOrigin } from "@/lib/processing/types";
import {
  sourceClaimKindLabels,
  sourceClaimKinds,
  sourceClaimStanceHelp,
  sourceClaimStanceLabels,
  sourceClaimStances,
  type SourceClaimStance,
} from "@/lib/processing/source-claims";

type Row = Record<string, unknown>;
const text = (value: unknown) => String(value ?? "");

export function SourceClaimProcessingPanel({
  projectId,
  sourceId,
  annotation,
  claims,
  assertions,
}: {
  projectId: string;
  sourceId: string;
  annotation: Row;
  claims: Row[];
  assertions: Row[];
}) {
  const router = useRouter();
  const excerpt = text(annotation.selected_text) || text(annotation.comment);
  const [pending, startTransition] = useTransition();
  const [selectedClaimId, setSelectedClaimId] = useState("");
  const [stance, setStance] = useState<SourceClaimStance>("ASSERTS");
  const [qualifier, setQualifier] = useState("");
  const [origin, setOrigin] = useState<MappingOrigin>("ANALYST_MAPPED");
  const [message, setMessage] = useState<{ error?: string; success?: string }>({});

  function linkExisting() {
    if (!selectedClaimId) return;
    startTransition(async () => {
      const result = await linkSourceClaimFromAnnotation(
        projectId,
        sourceId,
        text(annotation.id),
        selectedClaimId,
        stance,
        qualifier,
        origin,
      );
      setMessage(result);
      if (result.success) {
        setSelectedClaimId("");
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-5">
      <section className="rounded border border-amber-900/30 bg-amber-950/5 p-3">
        <p className="citem-label">Evidence / Source Claim</p>
        <p className="mt-2 text-sm leading-6 text-stone-400">
          Capture one atomic proposition reported by the source when it does not
          naturally belong to Malware, IOC, Timeline, ATT&CK or Attribution.
        </p>
        <p className="mt-2 text-xs leading-5 text-stone-600">
          A Source Claim records what reporting says. It is not yet a CITEM truth
          judgement, confidence score, hypothesis, or evidence-for/evidence-against
          decision.
        </p>
      </section>

      {assertions.length ? (
        <section className="rounded border border-stone-800 bg-black/10 p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="citem-label">Claims already linked to this annotation</p>
            <span className="font-mono text-xs text-stone-600">
              {assertions.length}
            </span>
          </div>
          <div className="mt-3 grid gap-2">
            {assertions.map((assertion) => {
              const claim = (assertion.source_claims ?? {}) as Row;
              return (
                <div
                  className="flex items-start justify-between gap-3 rounded border border-stone-800/80 bg-black/10 p-2"
                  key={text(assertion.id)}
                >
                  <div className="min-w-0">
                    <Link
                      className="block truncate text-xs font-medium text-stone-300 hover:text-amber-200"
                      href={`/projects/${projectId}/source-claims/${text(assertion.source_claim_id)}`}
                    >
                      {text(claim.claim_summary) || "Source Claim"}
                    </Link>
                    <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-stone-600">
                      {text(assertion.stance)} · {text(assertion.mapping_origin)}
                    </p>
                    {assertion.source_qualifier ? (
                      <p className="mt-1 text-[11px] text-stone-600">
                        Source qualifier: {text(assertion.source_qualifier)}
                      </p>
                    ) : null}
                  </div>
                  <button
                    className="shrink-0 text-xs text-stone-600 hover:text-red-300"
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        const result = await unlinkSourceClaimAssertion(
                          projectId,
                          sourceId,
                          text(annotation.id),
                          text(assertion.id),
                        );
                        setMessage(result);
                        if (result.success) router.refresh();
                      })
                    }
                  >
                    Unlink
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="rounded border border-stone-800 bg-black/10 p-3">
        <p className="citem-label">Link existing Source Claim</p>
        <p className="mt-1 text-xs leading-5 text-stone-600">
          CITEM never auto-merges semantically similar claims. Select an existing
          proposition only when you judge this source passage to address the same
          proposition.
        </p>
        <div className="mt-3 grid gap-2">
          <select
            className="field"
            value={selectedClaimId}
            onChange={(event) => setSelectedClaimId(event.currentTarget.value)}
          >
            <option value="">Select an existing Source Claim</option>
            {claims.map((claim) => (
              <option key={text(claim.id)} value={text(claim.id)}>
                [{text(claim.claim_kind)}] {text(claim.claim_summary)}
              </option>
            ))}
          </select>
          <div className="grid gap-2 md:grid-cols-2">
            <label className="grid gap-1">
              <span className="citem-label">Source stance</span>
              <select
                className="field"
                value={stance}
                onChange={(event) =>
                  setStance(event.currentTarget.value as SourceClaimStance)
                }
              >
                {sourceClaimStances.map((value) => (
                  <option key={value} value={value}>
                    {sourceClaimStanceLabels[value]}
                  </option>
                ))}
              </select>
              <span className="text-[11px] leading-4 text-stone-600">
                {sourceClaimStanceHelp[stance]}
              </span>
            </label>
            <label className="grid gap-1">
              <span className="citem-label">Mapping origin</span>
              <select
                className="field"
                value={origin}
                onChange={(event) =>
                  setOrigin(event.currentTarget.value as MappingOrigin)
                }
              >
                {mappingOrigins.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="grid gap-1">
            <span className="citem-label">Source qualifier</span>
            <input
              className="field"
              value={qualifier}
              onChange={(event) => setQualifier(event.currentTarget.value)}
              maxLength={1000}
              placeholder="e.g. likely; may have; we assess with moderate confidence"
            />
            <span className="text-[11px] leading-4 text-stone-600">
              Preserve the source&apos;s own epistemic wording. This is not CITEM
              confidence.
            </span>
          </label>
          <button
            className="citem-button justify-self-start"
            type="button"
            disabled={pending || !selectedClaimId}
            onClick={linkExisting}
          >
            Link existing claim
          </button>
        </div>
      </section>

      <form
        className="space-y-3 rounded border border-stone-800 bg-black/10 p-3"
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          startTransition(async () => {
            const result = await createSourceClaimFromAnnotation(
              projectId,
              sourceId,
              text(annotation.id),
              formData,
            );
            setMessage(result);
            if (result.success) router.refresh();
          });
        }}
      >
        <div>
          <p className="citem-label">Create new Source Claim</p>
          <p className="mt-1 text-xs leading-5 text-stone-600">
            Write one atomic, evaluable proposition. If the passage contains
            several propositions, create several Source Claims from the same
            annotation.
          </p>
        </div>

        <label className="grid gap-1">
          <span className="citem-label">Canonical proposition</span>
          <textarea
            className="field min-h-28"
            name="claim_summary"
            required
            maxLength={10000}
            defaultValue={excerpt}
          />
        </label>

        <div className="grid gap-2 md:grid-cols-2">
          <label className="grid gap-1">
            <span className="citem-label">Claim kind</span>
            <select className="field" name="claim_kind" defaultValue="GENERAL">
              {sourceClaimKinds.map((value) => (
                <option key={value} value={value}>
                  {sourceClaimKindLabels[value]}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="citem-label">Source stance</span>
            <select className="field" name="stance" defaultValue="ASSERTS">
              {sourceClaimStances.map((value) => (
                <option key={value} value={value}>
                  {sourceClaimStanceLabels[value]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="grid gap-1">
          <span className="citem-label">Source qualifier</span>
          <input
            className="field"
            name="source_qualifier"
            maxLength={1000}
            placeholder="Optional: likely; possibly; we assess; according to third-party reporting"
          />
        </label>

        <label className="grid gap-1">
          <span className="citem-label">Mapping origin</span>
          <select
            className="field"
            name="mapping_origin"
            defaultValue="ANALYST_MAPPED"
          >
            {mappingOrigins.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
          <span className="text-[11px] leading-4 text-stone-600">
            Use SOURCE_EXPLICIT only when the proposition itself is retained
            essentially as stated by the source. Use ANALYST_MAPPED when you
            normalize wording into a canonical proposition.
          </span>
        </label>

        <button className="citem-button" disabled={pending}>
          {pending ? "Saving…" : "Create Source Claim"}
        </button>
      </form>

      {message.error ? (
        <p className="text-sm text-red-300">{message.error}</p>
      ) : null}
      {message.success ? (
        <p className="text-sm text-emerald-300">{message.success}</p>
      ) : null}
    </div>
  );
}
