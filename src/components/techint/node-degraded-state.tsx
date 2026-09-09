export function NodeDegradedState({ context, detail }: { context: string; detail?: string }) {
  return <div role="status" className="rounded border border-amber-900/60 bg-amber-950/20 px-3 py-2 text-sm text-amber-200">
    <p className="font-semibold">DEGRADED · {context} UNKNOWN</p>
    <p className="mt-1 text-xs text-stone-400">{detail ?? "BAYKUSH Intelligence Node data is currently unavailable. Missing data is not zero or no activity."}</p>
  </div>;
}
