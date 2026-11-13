import { notFound } from "next/navigation";
import { z } from "zod";
import { requireOwnedProject } from "@/lib/projects/ownership";
import { HypothesisDetail } from "@/components/analysis/hypothesis-workbench";
export default async function HypothesisDetailPage({ params }: {
  params: Promise<{ id: string; hypothesisId: string }>;
}) {
  const { id, hypothesisId } = await params;
  if (!z.string().uuid().safeParse(hypothesisId).success) notFound();
  await requireOwnedProject(id).catch(() => notFound());
  return <HypothesisDetail projectId={id} hypothesisId={hypothesisId} />;
}
