import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

describe("CİTEM visual identity", () => {
  it("uses the approved original CİTEM PNG in primary user-facing surfaces", () => {
    const layout = readFileSync("src/app/layout.tsx", "utf8");
    const shell = readFileSync("src/components/shell.tsx", "utf8");
    const home = readFileSync("src/app/page.tsx", "utf8");
    const logo = readFileSync("src/components/citem-logo.tsx", "utf8");
    const assetPath = "public/brand/citem-owl-mark-original.png";

    expect(layout).toContain("CİTEM | Cyber Threat Intelligence");
    expect(shell).toContain("CitemLogo");
    expect(home).toContain("CitemLogo");
    expect(home).toContain("BAYKUSH");
    expect(logo).toContain("/brand/citem-owl-mark-original.png?v=original-20260726");
    expect(logo).toContain('"compact" | "horizontal"');
    expect(logo).toContain("<img");
    expect(logo).toContain('alt=""');
    expect(logo).not.toContain("citem-owl-mark-original.webp");
    expect(logo).not.toContain("citem-owl-mark.svg");
    expect(logo).not.toContain("BAYKUSH / CYBER INTELLIGENCE");
    expect(existsSync(assetPath)).toBe(true);
    expect(readFileSync(assetPath).subarray(0, 8)).toEqual(PNG_SIGNATURE);
    expect(shell).not.toContain("Cyber Research OS");
  });

  it("keeps the authenticated shell branding minimal and BAYKUSH-led", () => {
    const shell = readFileSync("src/components/shell.tsx", "utf8");

    expect(shell).toContain('<CitemLogo variant="compact" priority />');
    expect(shell).toContain("B A Y K U S H");
    expect(shell).not.toContain("Collection · Analysis · Operational direction");
    expect(shell).not.toContain("BAYKUSH / CYBER INTELLIGENCE");
  });

  it("uses the expanded CİTEM name on the public landing surface", () => {
    const home = readFileSync("src/app/page.tsx", "utf8");

    expect(home).toContain("Cyber Intelligence Threat Evaluation and Monitoring");
    expect(home).not.toContain("Cyber threat intelligence environment");
  });

  it("defines the approved military-map olive and amber palette", () => {
    const styles = readFileSync("src/app/globals.css", "utf8");
    const backgroundOverrides = readFileSync(
      "src/app/background-overrides.css",
      "utf8",
    );
    const layout = readFileSync("src/app/layout.tsx", "utf8");

    expect(styles).toContain(".command-hero");
    expect(styles).toContain(".citem-sidebar");
    expect(styles).toContain("focus-visible");
    expect(styles).toContain("prefers-reduced-motion");
    expect(backgroundOverrides).toContain("--background: #1f2a1b");
    expect(backgroundOverrides).toContain("--sidebar: #151b13");
    expect(backgroundOverrides).toContain("--surface: #111713");
    expect(backgroundOverrides).toContain("--surface-panel: #171e18");
    expect(backgroundOverrides).toContain("--surface-raised: #1c241b");
    expect(backgroundOverrides).toContain("--amber: #b9822f");
    expect(backgroundOverrides).toContain("--amber-soft: #d4a958");
    expect(backgroundOverrides).toContain("--foreground: #e8e1d6");
    expect(backgroundOverrides).toContain(".citem-landing");
    expect(backgroundOverrides).toContain(".citem-auth-page");
    expect(backgroundOverrides).toContain("background: #182118");
    expect(backgroundOverrides).toContain(".citem-shell");
    expect(backgroundOverrides).toContain("background: #1f2a1b");
    expect(backgroundOverrides).toContain("background: #111713");
    expect(layout).toContain('import "./background-overrides.css"');
  });

  it("keeps the dashboard metrics grounded in project data", () => {
    const dashboard = readFileSync("src/app/dashboard/page.tsx", "utf8");

    expect(dashboard).toContain('from("projects")');
    expect(dashboard).toContain("projects.length");
    expect(dashboard).not.toContain("24,837");
    expect(dashboard).not.toContain("1,248");
  });
});
