import Link from "next/link";

import { signIn } from "@/app/actions";
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
          <p className="citem-eyebrow">Secure workspace access</p>
          <h1 className="citem-title mt-3 text-3xl">Sign in</h1>
          <p className="mt-3 text-sm leading-6 text-stone-500">
            Continue to your private cyber intelligence workspace.
          </p>
          <ActionForm action={signIn}>
            <input name="email" type="email" required placeholder="Email" className="field mt-6" />
            <input name="password" type="password" required placeholder="Password" className="field" />
            <SubmitButton>Sign in</SubmitButton>
          </ActionForm>
          <p className="mt-5 text-sm text-stone-500">
            <Link className="citem-text-link" href="/auth/forgot-password">Forgot password?</Link>
            <span className="mx-2 text-stone-700">·</span>
            <Link className="citem-text-link" href="/auth/sign-up">Create account</Link>
          </p>
        </div>
      </section>
    </main>
  );
}
