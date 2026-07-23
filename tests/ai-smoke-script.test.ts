import { describe, expect, it } from "vitest";
import fs from "node:fs";

describe("AI smoke script environment behavior", () => {
  const script = fs.readFileSync("scripts/ai-smoke.mjs", "utf8");
  it("loads .env.local through Next env loading and preserves shell override behavior", () => {
    expect(script).toContain("loadEnvConfig");
    expect(script).toContain("process.cwd()");
    expect(script).toContain("AI smoke skipped: AI is disabled or unconfigured");
  });
  it("does not print AI base URL or API key values", () => {
    expect(script).not.toContain("console.log(base");
    expect(script).not.toContain("console.log(process.env.AI_API_KEY");
  });
});
