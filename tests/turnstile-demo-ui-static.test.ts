import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("demo Turnstile UI static checks", () => {
  it("does not submit the hard-coded development bypass from /demo/ai", () => {
    const ui = readFileSync("src/app/demo/ai/ui.tsx", "utf8");
    expect(ui).toContain("NEXT_PUBLIC_TURNSTILE_SITE_KEY");
    expect(ui).toContain("turnstile.render");
    expect(ui).not.toContain('turnstileToken:"CIP_DEV_TURNSTILE_BYPASS"');
    expect(ui).not.toContain('turnstileToken: "CIP_DEV_TURNSTILE_BYPASS"');
  });

  it("keeps Turnstile secret out of client UI and public env names", () => {
    const ui = readFileSync("src/app/demo/ai/ui.tsx", "utf8");
    const env = readFileSync(".env.example", "utf8");
    expect(ui).not.toContain("TURNSTILE_SECRET_KEY");
    expect(env).not.toMatch(/NEXT_PUBLIC_TURNSTILE_SECRET/);
  });
});
