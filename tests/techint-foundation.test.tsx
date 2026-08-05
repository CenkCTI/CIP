import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ShellNav } from "@/components/shell-nav";
import { normalizeTechIntItem, profileLocalKey } from "@/lib/techint/schema";
vi.mock("next/navigation",()=>({usePathname:()=>"/techint/profiles"}));
describe("TechINT foundation",()=>{it("shows TechINT as top-level navigation and keeps Strategic findings disabled",()=>{render(<ShellNav/>);expect(screen.getByText("Operational picture")).toBeInTheDocument();expect(screen.getByText("Investigations")).toBeInTheDocument();expect(screen.getByText("OSINT")).toBeInTheDocument();expect(screen.getByText("TechINT")).toBeInTheDocument();expect(screen.getByText("Strategic findings").closest("span")?.parentElement).toHaveAttribute("aria-disabled","true");expect(screen.getByText("TechINT").closest("a")).toHaveAttribute("data-active","true");});it("builds deterministic profile-local keys for separation and dedupe",()=>{expect(normalizeTechIntItem("CVE","cve-2026-1234")).toBe("CVE-2026-1234");expect(profileLocalKey("COUNTRY","germany","TARGET")).toBe("country:target:germany");});});
