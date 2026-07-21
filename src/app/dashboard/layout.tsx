import { requireUser } from "@/lib/auth";import { AppShell } from "@/components/shell";
export default async function Layout({children}:{children:React.ReactNode}){const {user}=await requireUser();return <AppShell email={user.email}>{children}</AppShell>}
