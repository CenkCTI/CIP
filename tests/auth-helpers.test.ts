import { describe, expect, it } from "vitest";
const safe = (path: string | null) => path?.startsWith("/") && !path.startsWith("//") ? path : "/dashboard";
describe("safe redirect rule",()=>{it("allows relative paths",()=>expect(safe("/projects")).toBe("/projects"));it("blocks protocol-relative open redirects",()=>expect(safe("//evil.test")).toBe("/dashboard"));it("blocks empty values",()=>expect(safe(null)).toBe("/dashboard"));});
