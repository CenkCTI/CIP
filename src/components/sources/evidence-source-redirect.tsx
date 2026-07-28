"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function EvidenceSourceRedirect({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    if (
      pathname === `/projects/${projectId}` &&
      searchParams.get("tab") === "evidence" &&
      searchParams.get("view") === "sources"
    ) {
      router.replace(`/projects/${projectId}/sources`);
    }
  }, [pathname, projectId, router, searchParams]);

  return null;
}
