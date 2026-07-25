import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("CİTEM visual identity", () => {
  it("uses the approved CİTEM brand in primary user-facing surfaces", () => {
    const layout = readFileSync("src/app/layout.tsx", "utf8");
    const shell = readFileSync("src/components/shell.tsx", "utf8");
    const home = readFileSync("src/app/page.tsx", "utf8");
    const logo = readFileSync("src/components/citem-logo.tsx", "utf8");
    const asset = readFileSync("public/brand/citem-owl-mark.svg", "utf8");

    expect(layout).toContain("CİTEM | Cyber Threat Intelligence");
    expect(shell).toContain("CitemLogo");
    expect(home).toContain("CitemLogo");
    expect(home).toContain("BAYKUSH");
    expect(logo).toContain("/brand/citem-owl-mark.svg");
    expect(logo).toContain('"compact" | "horizontal"');
    expect(logo).toContain("CİTEM half-owl eye logo");
    expect(asset).toContain("data:image/webp;base64,");
    expect(shell).not.toContain("Cyber Research OS");
  });

  it("keeps the authenticated shell branding minimal and BAYKUSH-led", () => {
    const shell = readFileSync("src/components/shell.tsx", "utf8");

    expect(shell).toContain('<CitemLogo variant="compact" priority />');
    expect(shell).toContain("B A Y K U S H");
    expect(shell).not.toContain("Collection · Analysis · Operational direction");
    expect(shell).not.toContain("BAYKUSH / CYBER INTELLIGENCE");
  });

  it("defines layered graphite surfaces, muted amber, and accessible motion/focus treatment", () => {
    const styles = readFileSync("src/app/globals.css", "utf8");

    expect(styles).toContain("--background: #0b0e11");
    expect(styles).toContain("--surface-panel: #14191d");
    expect(styles).toContain("--surface-raised: #181e22");
    expect(styles).toContain("--amber: #b9822f");
    expect(styles).toContain(".command-hero");
    expect(styles).toContain(".citem-sidebar");
    expect(styles).toContain("focus-visible");
    expect(styles).toContain("prefers-reduced-motion");
  });

  it("keeps the dashboard metrics grounded in project data", () => {
    const dashboard = readFileSync("src/app/dashboard/page.tsx", "utf8");

    expect(dashboard).toContain('from("projects")');
    expect(dashboard).toContain("projects.length");
    expect(dashboard).not.toContain("24,837");
    expect(dashboard).not.toContain("1,248");
  });
});
