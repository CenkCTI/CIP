"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  deleteSourceClaim,
  unlinkSourceClaimAssertion,
  updateSourceClaim,
  updateSourceClaimAssertion,
} from "@/app/projects/[id]/source-processing-actions";
import { mappingOrigins, type MappingOrigin } from "@/lib/processing/types";
import {
  sourceClaimKindLabels,
  sourceClaimKinds,
  sourceClaimStanceHelp,
  sourceClaimStanceLabels,
  sourceClaimStances,
  type SourceClaimKind,
  type SourceClaimStance,
} from "@/lib/processing/source-claims";

type Row = Record<string, unknown>;
const text = (value: unknown) => String(value ?? "");

function stanceTone(value: string) {
  if (value === "ASSERTS") return "border-emerald-900/60 text-emerald-300";
  if (value === "DENIES") return "border-red-900/60 text-red-300";
  if (value === "QUALIFIES") return "border-amber-900/60 text-amber-300";
  return "border-stone-700 text-stone-400";
}

export function SourceClaimDirectory({
  projectId,
  rows,
  query,
  kind,
}: {
  projectId: string;
  rows: Row[];
  query: string;
  kind: string;
}) {
  return (
    <section className="mx-auto max-w-6xl space-y-4">
      <header>
        <p className="citem-label">Stage 3 · Processing</p>
        <h1 className="mt-1 text-3xl font-bold text-white">Source Claims</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-500">
          Canonical propositions extracted from reporting. A Source Claim records
          what sources say; it is not yet a CITEM truth judgement, confidence
          score, hypothesis, or assessment.
        </p>
      </header>

      <form className="flex flex-wrap gap-2 rounded border border-stone-800/80 bg-black/10 p-3">
        <input
          className="field min-w-64 flex-1"
          name="q"
          defaultValue={query}
          placeholder="Search proposition text"
        />
        <select className="field max-w-56" name="kind" defaultValue={kind}>
          <option value="">All claim kinds</option>
          {sourceClaimKinds.map((value) => (
            <option key={value} value={value}>
              {sourceClaimKindLabels[value]}
            </option>
          ))}
        </select>
        <button className="citem-button-ghost">Filter</button>
      </form>

      <div className="grid gap-3">
        {rows.map((claim) => {
          const assertions = Array.isArray(claim.source_claim_assertions)
            ? (claim.source_claim_assertions as Row[])
            : [];
          const counts = sourceClaimStances.reduce(
            (acc, stance) => ({
              ...acc,
              [stance]: assertions.filter(
                (assertion) => text(assertion.stance) === stance,
              ).length,
            }),
            {} as Record<SourceClaimStance, number>,
          );
          return (
            <Link
              key={text(claim.id)}
              href={`/projects/${projectId}/source-claims/${text(claim.id)}`}
              className="rounded-lg border border-stone-800 bg-[#0f1417] p-4 transition hover:border-amber-900/60 hover:bg-[#11181b]"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="citem-badge" data-tone="attention">
                      {sourceClaimKindLabels[
                        text(claim.claim_kind) as SourceClaimKind
                      ] ?? text(claim.claim_kind)}
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-stone-700">
                      {assertions.length} source position
                      {assertions.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <p className="mt-3 text-base font-medium leading-7 text-stone-200">
                    {text(claim.claim_summary)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {sourceClaimStances.map((stance) =>
                    counts[stance] ? (
                      <span
                        className={`rounded border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] ${stanceTone(stance)}`}
                        key={stance}
                      >
                        {counts[stance]} {stance}
                      </span>
                    ) : null,
                  )}
                </div>
              </div>
            </Link>
          );
        })}
        {!rows.length ? (
          <div className="card text-sm text-stone-500">
            No Source Claims match this view. Create them from a Source Annotation
            using <strong className="text-stone-300">Evidence / Source Claim</strong>.
          </div>
        ) : null}
      </div>
    </section>
  );
}

function AssertionCard({
  projectId,
  assertion,
}: {
  projectId: string;
  assertion: Row;
}) {
  const router = useRouter();
  const annotation = (assertion.annotation ?? {}) as Row;
  const source = (assertion.source ?? {}) as Row;
  const asset = (assertion.asset ?? {}) as Row;
  const [stance, setStance] = useState<SourceClaimStance>(
    (text(assertion.stance) || "ASSERTS") as SourceClaimStance,
  );
  const [qualifier, setQualifier] = useState(text(assertion.source_qualifier));
  const [origin, setOrigin] = useState<MappingOrigin>(
    (text(assertion.mapping_origin) || "ANALYST_MAPPED") as MappingOrigin,
  );
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const sourceId = text(annotation.source_id);
  const annotationId = text(annotation.id);
  const quote =
    text(annotation.selected_text) ||
    text(annotation.comment) ||
    "Region annotation; no extracted text.";

  return (
    <article className="rounded border border-stone-800 bg-black/15 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-stone-200">
            {text(source.title) || "Source"}
          </p>
          <p className="mt-1 text-xs text-stone-600">
            {text(source.publisher) || "Publisher not recorded"}
            {annotation.page_number ? ` · p. ${text(annotation.page_number)}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <span
            className={`rounded border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] ${stanceTone(stance)}`}
          >
            {stance}
          </span>
          <span className="citem-badge">{text(assertion.assertion_action)}</span>
        </div>
      </div>

      <blockquote className="mt-3 border-l-2 border-amber-800/60 pl-3 text-xs leading-5 text-stone-500">
        {quote}
      </blockquote>

      <div className="mt-3 grid gap-2 md:grid-cols-3">
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
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 md:col-span-2">
          <span className="citem-label">Source qualifier</span>
          <input
            className="field"
            value={qualifier}
            onChange={(event) => setQualifier(event.currentTarget.value)}
            maxLength={1000}
            placeholder="Source wording: likely; may have; we assess..."
          />
        </label>
      </div>
      <label className="mt-2 grid gap-1">
        <span className="citem-label">Mapping origin</span>
        <select
          className="field max-w-xs"
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
      <p className="mt-2 text-[11px] leading-4 text-stone-600">
        {sourceClaimStanceHelp[stance]} Source stance is not CITEM confidence.
      </p>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-stone-800/70 pt-3">
        <div className="min-w-0 text-[11px] text-stone-700">
          {asset.original_filename ? text(asset.original_filename) : ""}
          {asset.sha256
            ? ` · SHA-256 ${text(asset.sha256).slice(0, 14)}…${text(asset.sha256).slice(-8)}`
            : ""}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {sourceId && annotationId ? (
            <Link
              className="text-xs font-medium text-amber-300 hover:text-amber-200"
              href={`/projects/${projectId}/sources/${sourceId}?annotation=${annotationId}`}
            >
              Open annotation →
            </Link>
          ) : null}
          <button
            className="citem-button-ghost min-h-0 px-2.5 py-1.5 text-xs"
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await updateSourceClaimAssertion(
                  projectId,
                  text(assertion.id),
                  stance,
                  qualifier,
                  origin,
                );
                setMessage(result.error ?? result.success ?? "");
                if (result.success) router.refresh();
              })
            }
          >
            Save position
          </button>
          <button
            className="text-xs text-red-400 hover:text-red-300"
            type="button"
            disabled={pending || !sourceId || !annotationId}
            onClick={() => {
              if (
                !window.confirm(
                  "Unlink this source position? If it is the final support for the claim, the unsupported Source Claim will also be removed.",
                )
              )
                return;
              startTransition(async () => {
                const result = await unlinkSourceClaimAssertion(
                  projectId,
                  sourceId,
                  annotationId,
                  text(assertion.id),
                );
                setMessage(result.error ?? result.success ?? "");
                if (result.success) router.refresh();
              });
            }}
          >
            Unlink support
          </button>
        </div>
      </div>
      {message ? <p className="mt-2 text-xs text-stone-500">{message}</p> : null}
    </article>
  );
}

export function SourceClaimDetail({
  projectId,
  claim,
  assertions,
}: {
  projectId: string;
  claim: Row;
  assertions: Row[];
}) {
  const router = useRouter();
  const [summary, setSummary] = useState(text(claim.claim_summary));
  const [kind, setKind] = useState<SourceClaimKind>(
    text(claim.claim_kind) as SourceClaimKind,
  );
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  const counts = sourceClaimStances.reduce(
    (acc, stance) => ({
      ...acc,
      [stance]: assertions.filter(
        (assertion) => text(assertion.stance) === stance,
      ).length,
    }),
    {} as Record<SourceClaimStance, number>,
  );

  return (
    <section className="mx-auto max-w-6xl space-y-4">
      <header>
        <Link
          className="text-sm font-medium text-amber-300 hover:text-amber-200"
          href={`/projects/${projectId}/source-claims`}
        >
          ← Source Claims
        </Link>
        <p className="citem-label mt-3">Source Claim</p>
        <h1 className="mt-1 max-w-4xl text-2xl font-semibold leading-9 text-stone-100">
          {text(claim.claim_summary)}
        </h1>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="citem-badge" data-tone="attention">
            {sourceClaimKindLabels[kind]}
          </span>
          {sourceClaimStances.map((stance) =>
            counts[stance] ? (
              <span
                key={stance}
                className={`rounded border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] ${stanceTone(stance)}`}
              >
                {counts[stance]} {sourceClaimStanceLabels[stance]}
              </span>
            ) : null,
          )}
        </div>
      </header>

      <section className="rounded-lg border border-stone-800 bg-[#0f1417] p-4">
        <p className="citem-label">Canonical proposition</p>
        <p className="mt-1 text-xs leading-5 text-stone-600">
          Normalize wording without turning it into a CITEM judgement. Keep the
          proposition atomic enough that sources can clearly assert, deny, or
          qualify it.
        </p>
        <div className="mt-3 grid gap-3">
          <textarea
            className="field min-h-28"
            value={summary}
            onChange={(event) => setSummary(event.currentTarget.value)}
            maxLength={10000}
          />
          <select
            className="field max-w-xs"
            value={kind}
            onChange={(event) =>
              setKind(event.currentTarget.value as SourceClaimKind)
            }
          >
            {sourceClaimKinds.map((value) => (
              <option key={value} value={value}>
                {sourceClaimKindLabels[value]}
              </option>
            ))}
          </select>
          <div className="flex flex-wrap gap-2">
            <button
              className="citem-button"
              type="button"
              disabled={pending || !summary.trim()}
              onClick={() =>
                startTransition(async () => {
                  const result = await updateSourceClaim(
                    projectId,
                    text(claim.id),
                    { claim_summary: summary, claim_kind: kind },
                  );
                  setMessage(result.error ?? result.success ?? "");
                  if (result.success) router.refresh();
                })
              }
            >
              Save claim
            </button>
            <button
              className="citem-button-ghost text-red-300"
              type="button"
              disabled={pending}
              onClick={() => {
                if (
                  !window.confirm(
                    "Delete this Source Claim and all of its source-position links? Source annotations themselves are preserved.",
                  )
                )
                  return;
                startTransition(async () => {
                  const result = await deleteSourceClaim(
                    projectId,
                    text(claim.id),
                  );
                  if (result.error) {
                    setMessage(result.error);
                    return;
                  }
                  router.push(`/projects/${projectId}/source-claims`);
                  router.refresh();
                });
              }}
            >
              Delete claim
            </button>
          </div>
          {message ? <p className="text-xs text-stone-500">{message}</p> : null}
        </div>
      </section>

      <section className="rounded-lg border border-stone-800 bg-[#0f1417] p-4">
        <p className="citem-label">Source positions</p>
        <h2 className="mt-1 text-lg font-semibold text-stone-100">
          Assertions, denials and qualifications
        </h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-stone-500">
          Multiple sources may take different positions toward the same canonical
          proposition. Counts are descriptive only; they are not corroboration
          scores because source independence and credibility are evaluated later.
        </p>
        <div className="mt-4 grid gap-3">
          {assertions.map((assertion) => (
            <AssertionCard
              key={text(assertion.id)}
              projectId={projectId}
              assertion={assertion}
            />
          ))}
          {!assertions.length ? (
            <p className="text-sm text-stone-600">
              No source positions remain. Unsupported Source Claims are normally
              removed automatically when their final assertion is unlinked.
            </p>
          ) : null}
        </div>
      </section>
    </section>
  );
}
