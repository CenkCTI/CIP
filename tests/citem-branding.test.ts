import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("CİTEM visual identity", () => {
  it("uses the CİTEM brand in primary user-facing surfaces", () => {
    const layout = readFileSync("src/app/layout.tsx", "utf8");
    const shell = readFileSync("src/components/shell.tsx", "utf8");
    const home = readFileSync("src/app/page.tsx", "utf8");

    expect(layout).toContain("CİTEM | Cyber Threat Intelligence");
    expect(shell).toContain("CİTEM");
    expect(home).toContain("BAYKUSH");
    expect(shell).not.toContain("Cyber Research OS");
  });

  it("defines the command-center visual tokens and accessible focus treatment", () => {
    const styles = readFileSync("src/app/globals.css", "utf8");

    expect(styles).toContain("--amber:");
    expect(styles).toContain(".command-hero");
    expect(styles).toContain(".citem-sidebar");
    expect(styles).toContain("focus-visible");
  });

  it("keeps the dashboard metrics grounded in project data", () => {
    const dashboard = readFileSync("src/app/dashboard/page.tsx", "utf8");

    expect(dashboard).toContain('from("projects")');
    expect(dashboard).toContain("projects.length");
    expect(dashboard).not.toContain("24,837");
    expect(dashboard).not.toContain("1,248");
  });
});
