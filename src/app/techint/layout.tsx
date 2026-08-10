import type { ReactNode } from "react";

import { AppShell } from "@/components/shell";
import { TechIntNav } from "@/components/techint/nav";
import { requireUser } from "@/lib/auth";

export default async function Layout({ children }: { children: ReactNode }) {
  const { user } = await requireUser();

  return (
    <AppShell email={user.email}>
      <TechIntNav />
      {children}
    </AppShell>
  );
}
