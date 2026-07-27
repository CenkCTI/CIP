import Link from "next/link";

import { signUp } from "@/app/actions";
import { CitemLogo } from "@/components/citem-logo";
import { ActionForm, SubmitButton } from "@/components/form-status";

export default function Page() {
  return (
    <main className="citem-landing citem-auth-page">
      <section className="citem-auth-shell">
        <Link href="/" className="citem-auth-brand" aria-label="CİTEM home">
          <CitemLogo priority />
        </Link>
        <div className="card panel-corners citem-auth-card">
          <p className="citem-eyebrow">Create analyst workspace</p>
          <h1 className="citem-title mt-3 text-3xl">Create account</h1>
          <p className="mt-3 text-sm leading-6 text-stone-500">
            Start an isolated CİTEM workspace for evidence-backed intelligence production.
          </p>
          <ActionForm action={signUp}>
            <input name="display_name" placeholder="Display name" className="field mt-6" />
            <input name="email" type="email" required placeholder="Email" className="field" />
            <input name="password" type="password" required minLength={8} placeholder="Password" className="field" />
            <SubmitButton>Create account</SubmitButton>
          </ActionForm>
          <p className="mt-5 text-sm text-stone-500">
            Already registered?{" "}
            <Link className="citem-text-link" href="/auth/sign-in">Sign in</Link>
          </p>
        </div>
      </section>
    </main>
  );
}
