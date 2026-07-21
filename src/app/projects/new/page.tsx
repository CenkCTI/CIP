import { createProject } from "@/app/actions";import { ProjectForm } from "@/components/project-form";
export default function Page(){return <section className="mx-auto max-w-2xl"><h1 className="mb-6 text-3xl font-bold text-white">New project</h1><div className="card"><ProjectForm action={createProject}/></div></section>}
