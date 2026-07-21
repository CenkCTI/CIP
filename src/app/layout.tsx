import type { Metadata } from "next";
import "./globals.css";
import "@xyflow/react/dist/style.css";
export const metadata: Metadata = { title: "Cyber Research OS", description: "Cyber research management platform" };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="en"><body>{children}</body></html>; }
