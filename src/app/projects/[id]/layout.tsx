import type { ReactNode } from "react";
import { InvestigationWorkspaceNav } from "@/components/investigations/workspace-nav";
import { EvidenceSourceRedirect } from "@/components/sources/evidence-source-redirect";

export default async function InvestigationLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <>
      <EvidenceSourceRedirect projectId={id} />
      <InvestigationWorkspaceNav projectId={id} />
      {children}
    </>
  );
}
