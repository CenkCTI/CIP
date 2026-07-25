import Link from "next/link";

import { signUp } from "@/app/actions";
import { ActionForm, SubmitButton } from "@/components/form-status";

export default function Page() {
  return (
    <main className="citem-landing grid min-h-screen place-items-center px-4 py-12">
      <section className="relative z-10 w-full max-w-md">
        <Link href="/" className="mb-5 flex items-center justify-center gap-3">
          <span className="citem-wordmark">CİTEM</span>
          <span className="citem-brand-kicker">BAYKUSH / CTI</span>
        </Link>
        <div className="card panel-corners p-7 md:p-9">
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
            <Link className="text-amber-300 hover:text-amber-200" href="/auth/sign-in">Sign in</Link>
          </p>
        </div>
      </section>
    </main>
  );
}
