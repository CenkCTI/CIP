import {act,render,fireEvent,screen} from "@testing-library/react";
import {describe,it,expect,vi,afterEach} from "vitest";
import {EvidenceTextFocus} from "@/components/investigations/source-reader/ai/evidence-text-focus";
import {ClaimComparisonReview} from "@/components/investigations/source-reader/ai/claim-comparison-review";
afterEach(()=>vi.useRealTimers());

describe("Evidence Focus 5-second transient web highlight",()=>{
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
