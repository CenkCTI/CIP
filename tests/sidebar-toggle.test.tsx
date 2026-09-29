import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SidebarToggle } from "@/components/sidebar-toggle";

describe("SidebarToggle", () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.citemSidebar;
  });

  afterEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.citemSidebar;
  });

  it("hides and restores the sidebar while persisting the preference", async () => {
    render(<SidebarToggle />);

    await waitFor(() => {
      expect(document.documentElement).toHaveAttribute("data-citem-sidebar", "expanded");
    });

    const hideButton = screen.getByRole("button", { name: "Hide sidebar" });
    expect(hideButton).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(hideButton);

    expect(document.documentElement).toHaveAttribute("data-citem-sidebar", "collapsed");
    expect(window.localStorage.getItem("citem.sidebar.collapsed")).toBe("true");
    expect(screen.getByRole("button", { name: "Show sidebar" })).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(screen.getByRole("button", { name: "Show sidebar" }));

    expect(document.documentElement).toHaveAttribute("data-citem-sidebar", "expanded");
    expect(window.localStorage.getItem("citem.sidebar.collapsed")).toBe("false");
  });

  it("restores a collapsed sidebar preference on mount", async () => {
    window.localStorage.setItem("citem.sidebar.collapsed", "true");

    render(<SidebarToggle />);

    await waitFor(() => {
      expect(document.documentElement).toHaveAttribute("data-citem-sidebar", "collapsed");
      expect(screen.getByRole("button", { name: "Show sidebar" })).toBeInTheDocument();
    });
  });
});
