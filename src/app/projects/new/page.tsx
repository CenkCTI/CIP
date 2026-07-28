import { createProject } from "@/app/actions";
import { ProjectForm } from "@/components/project-form";

export default function Page() {
  return (
    <section className="mx-auto max-w-2xl">
      <p className="citem-eyebrow">CİTEM / Investigation registry</p>
      <h1 className="mb-6 mt-3 text-3xl font-bold text-white">
        New investigation
      </h1>
      <div className="card">
        <ProjectForm action={createProject} />
      </div>
    </section>
  );
}
