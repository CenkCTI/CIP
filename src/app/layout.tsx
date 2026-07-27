import type { Metadata } from "next";

import "./globals.css";
import "@xyflow/react/dist/style.css";
import "./background-overrides.css";

export const metadata: Metadata = {
  title: {
    default: "CİTEM | Cyber Threat Intelligence",
    template: "%s | CİTEM",
  },
  description:
    "BAYKUSH CİTEM cyber threat intelligence and operational research workspace",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
