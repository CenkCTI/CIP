import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/techint/sources" }));
vi.mock("next/link", () => ({ default: (p: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...p} /> }));

import { ShellNav } from "@/components/shell-nav";

describe("OSINT navigation retirement", () => {
  it("consolidates the former OSINT surface under the active TechINT destination", () => {
    render(<ShellNav />);
    expect(screen.queryByRole("link", { name: /OSINT/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /TechINT/ })).toHaveAttribute("href", "/techint");
    expect(screen.getByRole("link", { name: /TechINT/ })).toHaveAttribute("aria-current", "page");
  });
});
