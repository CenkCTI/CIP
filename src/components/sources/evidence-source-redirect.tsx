"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function EvidenceSourceRedirect({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    if (pathname !== `/projects/${projectId}`) return;

    const tab = searchParams.get("tab");
    if (tab === "notes") {
      const note = searchParams.get("note");
      router.replace(
        note
          ? `/projects/${projectId}/notes?note=${encodeURIComponent(note)}`
          : `/projects/${projectId}/notes`,
      );
      return;
    }

    if (tab === "reports") {
      router.replace(`/projects/${projectId}/reports`);
      return;
    }

    if (tab === "evidence" && searchParams.get("view") === "sources") {
      router.replace(`/projects/${projectId}/sources`);
    }
  }, [pathname, projectId, router, searchParams]);

  return null;
}
