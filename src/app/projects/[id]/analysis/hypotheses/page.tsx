import { notFound } from "next/navigation";
import { requireOwnedProject } from "@/lib/projects/ownership";
import { HypothesisDirectory } from "@/components/analysis/hypothesis-workbench";
export default async function HypothesesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireOwnedProject(id).catch(() => notFound());
  return <HypothesisDirectory projectId={id} />;
}
