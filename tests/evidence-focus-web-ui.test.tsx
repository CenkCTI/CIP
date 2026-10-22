import {readFileSync} from "node:fs";
import {act,render,fireEvent,screen} from "@testing-library/react";
import {describe,it,expect,vi,afterEach} from "vitest";
import {EvidenceTextFocus} from "@/components/investigations/source-reader/ai/evidence-text-focus";
import {ClaimComparisonReview} from "@/components/investigations/source-reader/ai/claim-comparison-review";
afterEach(()=>vi.useRealTimers());

describe("Evidence Focus 5-second transient web highlight",()=>{
  it("uses a rounded dark-emerald glass accent for PDF and WEB without a boxed marker",()=>{
    const css=readFileSync("src/app/globals.css","utf8");
    const segment=css.match(/\.citem-evidence-focus-segment\{([^}]+)\}/)?.[1]??"";
    expect(segment).toContain("border:0");
    expect(segment).toContain("border-radius:9px");
    expect(segment).toContain("rgba(12,51,31,.30)");
    expect(segment).toContain("citem-evidence-strip-5s 5s");
    expect(css).toContain(".citem-evidence-inline-active{animation:citem-evidence-web-5s 5s");
    expect(css).toContain(".citem-evidence-focus-trigger");
    const underline=css.match(/\.citem-evidence-focus-segment::after,\s*\.citem-evidence-inline-active::after\{([^}]+)\}/)?.[1]??"";
    expect(underline).toContain("height:3px");
    expect(underline).toContain("border-radius:999px");
    expect(underline).toContain("#2e9b61");
    expect(underline).toContain("#a7edc0");
    expect(underline).toContain("0 0 9px rgba(46,164,93,.38)");
    expect(underline).toContain("citem-evidence-underline-soft-5s 5s");
    expect(css).toContain(".citem-evidence-focus-segment::before{");
    expect(css).toContain("border-radius:inherit");
    // Other CİTEM surfaces may legitimately blur their own backdrops.
    // Only the evidence focus overlay must avoid blurring source PDF text.
    const evidenceStyles=css.slice(css.indexOf("/* CİTEM Evidence Focus"));
    expect(evidenceStyles).not.toContain("backdrop-filter:blur");
    expect(css).toContain("citem-evidence-underline-reduced-5s 5s");
    expect(css).toContain("citem-evidence-web-reduced-5s 5s");
    expect(css).toContain("pointer-events:none");
    expect(css).not.toContain("#e5b65c");
    expect(css).not.toContain("citem-evidence-hud-5s");
    expect(css).not.toContain("corner brackets signal acquisition");
    expect(css).toContain("@media(prefers-reduced-motion:reduce)");
  });
  it("activates on click and fully removes emphasis after exactly 5000 ms; replays",()=>{
    vi.useFakeTimers();
    render(<EvidenceTextFocus label="Focus WEB_001 excerpt">
      <blockquote>The original verified passage</blockquote>
    </EvidenceTextFocus>);
    const trigger=screen.getByRole("button",{name:"Focus WEB_001 excerpt"});
    const content=screen.getByTestId("web-evidence-text");
    expect(content.className).not.toContain("citem-evidence-inline-active");
    act(()=>fireEvent.click(trigger));
    expect(screen.getByTestId("web-evidence-text").className).toContain("citem-evidence-inline-active");
    act(()=>vi.advanceTimersByTime(4999));
    expect(screen.getByTestId("web-evidence-text").className).toContain("citem-evidence-inline-active");
    act(()=>vi.advanceTimersByTime(1));
    expect(screen.getByTestId("web-evidence-text").className).not.toContain("citem-evidence-inline-active");
    act(()=>fireEvent.click(trigger));
    expect(screen.getByTestId("web-evidence-text").className).toContain("citem-evidence-inline-active");
    act(()=>vi.advanceTimersByTime(5000));
    expect(screen.getByTestId("web-evidence-text").className).not.toContain("citem-evidence-inline-active");
  });
  it("does not elevate a search snippet into a verified citation",()=>{
    render(<EvidenceTextFocus kind="lead" label="Focus search lead">
      <p>Brave snippet · not verified evidence</p>
    </EvidenceTextFocus>);
    expect(screen.getByTestId("web-evidence-text").parentElement?.dataset.evidenceKind)
      .toBe("lead");
    expect(screen.getByText(/not verified evidence/)).toBeTruthy();
  });
  it("navigates Phase 6 PDF with its exact quote",()=>{
    const navigate=vi.fn();
    render(<ClaimComparisonReview onNavigate={navigate} result={{
      status:"analyst_review_required",
      pdfClaim:{paraphrase:"A question about China",quote:"Your reports cites examples of China being the leading provider",
        sourceToken:"DOC_P011_C01",originKind:"attributed_or_question",
        sourceId:"a",assetId:"b",page:11},
      rows:[],openQuestions:[],discarded:0,warnings:[],skippedSources:[],
    }}/>);
    fireEvent.click(screen.getByRole("button",{name:"Go to PDF evidence"}));
    expect(navigate).toHaveBeenCalledWith(11,undefined,
      "Your reports cites examples of China being the leading provider");
  });
});
