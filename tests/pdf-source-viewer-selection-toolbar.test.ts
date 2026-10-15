import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("PDF selection toolbar dismissal", () => {
  const viewer = readFileSync(
    "src/components/investigations/source-reader/pdf/pdf-source-viewer.tsx",
    "utf8",
  );

  it("dismisses the transient selection toolbar on outside interaction", () => {
    expect(viewer).toContain('document.addEventListener("pointerdown",onPointerDown,true)');
    expect(viewer).toContain('document.addEventListener("contextmenu",onContextMenu,true)');
    expect(viewer).toContain('document.addEventListener("scroll",dismiss,true)');
    expect(viewer).toContain('window.addEventListener("resize",dismiss)');
    expect(viewer).toContain('window.addEventListener("wheel",dismiss,{capture:true,passive:true})');
    expect(viewer).toContain('if(event.key==="Escape")dismiss()');
  });

  it("keeps toolbar actions clickable and ignores non-primary selection capture", () => {
    expect(viewer).toContain("selectionToolbarRef.current?.contains(event.target as Node)");
    expect(viewer).toContain("if(event.button!==0)return;");
    expect(viewer).toContain("ref={selectionToolbarRef}");
  });
});
