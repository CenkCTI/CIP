import Link from "next/link";

import { signIn } from "@/app/actions";
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
            <Link className="text-amber-300 hover:text-amber-200" href="/auth/forgot-password">Forgot password?</Link>
            <span className="mx-2 text-stone-700">·</span>
            <Link className="text-amber-300 hover:text-amber-200" href="/auth/sign-up">Create account</Link>
          </p>
        </div>
      </section>
    </main>
  );
}
