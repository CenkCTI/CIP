import Link from "next/link";

import { forgotPassword } from "@/app/actions";
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
          <p className="citem-eyebrow">Account recovery</p>
          <h1 className="citem-title mt-3 text-3xl">Reset password</h1>
          <p className="mt-3 text-sm leading-6 text-stone-500">
            Requires Supabase Auth email recovery with Site URL configured.
          </p>
          <ActionForm action={forgotPassword}>
            <input name="email" type="email" required placeholder="Email" className="field mt-6" />
            <SubmitButton>Send reset link</SubmitButton>
          </ActionForm>
          <Link className="citem-text-link mt-5 inline-flex" href="/auth/sign-in">Return to sign in</Link>
        </div>
      </section>
    </main>
  );
}
