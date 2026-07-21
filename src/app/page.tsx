export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <section className="max-w-2xl rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
        <p className="mb-3 text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
          CIP
        </p>
        <h1 className="text-4xl font-bold tracking-tight text-slate-950 sm:text-5xl">
          Clean foundation ready for preflight.
        </h1>
        <p className="mt-6 text-base leading-7 text-slate-600">
          This repository contains the minimal Next.js App Router foundation for
          future Cyber Research OS work.
        </p>
      </section>
    </main>
  );
}
