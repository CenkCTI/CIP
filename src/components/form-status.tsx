"use client";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
export function SubmitButton({ children }: { children: React.ReactNode }) { const { pending } = useFormStatus(); return <button className="rounded-lg bg-cyan-400 px-4 py-2 font-semibold text-slate-950 disabled:opacity-60" disabled={pending}>{pending ? "Working…" : children}</button>; }
export function ActionForm({ action, children }: { action: (s: {error?:string; success?:string}, f: FormData)=>Promise<{error?:string; success?:string}>; children: React.ReactNode }) { const [state, formAction] = useActionState(action, {}); return <form action={formAction} className="space-y-4">{children}{state.error && <p role="alert" className="text-sm text-red-300">{state.error}</p>}{state.success && <p className="text-sm text-emerald-300">{state.success}</p>}</form>; }
