import Link from "next/link";

import { updatePassword } from "@/app/actions";
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
          <p className="citem-eyebrow">Credential update</p>
          <h1 className="citem-title mt-3 text-3xl">Update password</h1>
          <ActionForm action={updatePassword}>
            <input name="password" type="password" required minLength={8} placeholder="New password" className="field mt-6" />
            <SubmitButton>Update password</SubmitButton>
          </ActionForm>
          <Link className="citem-text-link mt-5 inline-flex" href="/dashboard">Continue</Link>
        </div>
      </section>
    </main>
  );
}
