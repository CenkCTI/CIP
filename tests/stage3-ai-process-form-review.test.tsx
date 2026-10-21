import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Stage3Candidate } from "@/lib/ai/stage3/candidates";
import { AnnotationTimelineActions } from "@/components/investigations/source-reader/annotation-timeline-actions";
import { SourceClaimProcessingPanel } from "@/components/investigations/source-reader/source-claim-processing-panel";

const mocks=vi.hoisted(()=>({
  refresh:vi.fn(),
  timelineCreate:vi.fn(),
  timelineLink:vi.fn(),
  claimCreate:vi.fn(),
  claimLink:vi.fn(),
  claimUnlink:vi.fn(),
}));
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:mocks.refresh})}));
vi.mock("@/app/projects/[id]/timeline-actions",()=>({
  createTimelineEventFromAnnotation:mocks.timelineCreate,
  linkAnnotationToTimelineEvent:mocks.timelineLink,
}));
vi.mock("@/app/projects/[id]/source-processing-actions",()=>({
  createSourceClaimFromAnnotation:mocks.claimCreate,
  linkSourceClaimFromAnnotation:mocks.claimLink,
  unlinkSourceClaimAssertion:mocks.claimUnlink,
}));

const projectId="49429515-bc04-4539-ae53-69f0b47157cb";
const sourceId="49429615-bc04-4539-ae53-69f0b47157cb";
const annotation={id:"49429815-bc04-4539-ae53-69f0b47157cb",
  selected_text:"The source reports targeting on 2026-10-21.",page_number:5};
const verification=[{statement:"TIMELINE",sourceToken:"DOC_P005_C01",
  quote:"targeting on 2026-10-21",page:5,kind:"PDF",
  provenance:{sourceId,assetId:"49429715-bc04-4539-ae53-69f0b47157cb"}}];
const timeline:Extract<Stage3Candidate,{kind:"TIMELINE"}>={
  kind:"TIMELINE",candidateId:"test-timeline",derivation:"EXTRACTED",sourceSupport:[],
  verifiedSupport:verification as never,caveats:[],status:"NOT_SAVED",
  eventName:"Polish institutions targeted",description:"Source reports targeting activity.",
  sourceTimeExpression:"2026-10-21",normalizedDate:"2026-10-21",temporalPrecision:"DAY",
};
const claim:Extract<Stage3Candidate,{kind:"SOURCE_CLAIM"}>={
  kind:"SOURCE_CLAIM",candidateId:"test-claim",derivation:"NORMALIZED",sourceSupport:[],
  verifiedSupport:verification as never,caveats:[],status:"NOT_SAVED",
  claim:"The operation targeted Polish institutions.",claimType:"TARGETING",stance:"ASSERTS",
  sourceQualifier:"According to the source",
};
beforeEach(()=>{
  vi.clearAllMocks();
  mocks.timelineCreate.mockResolvedValue({success:"Created"});
  mocks.claimCreate.mockResolvedValue({success:"Created"});
});
describe("AI suggestion to existing analyst-controlled Process form",()=>{
  it("prefills Timeline fields but does not write until analyst submits",async()=>{
    render(<AnnotationTimelineActions projectId={projectId} sourceId={sourceId}
      annotation={annotation} events={[]} links={[]} aiCandidate={timeline}/>);
    expect(screen.getByText(/AI SUGGESTION/)).toBeTruthy();
    expect(screen.getByDisplayValue("Polish institutions targeted")).toBeTruthy();
    expect(screen.getByDisplayValue("Source reports targeting activity.")).toBeTruthy();
    expect(screen.getByDisplayValue("2026-10-21")).toBeTruthy();
    expect(mocks.timelineCreate).not.toHaveBeenCalled();
    const button=screen.getByRole("button",{name:"Add to Timeline"});
    fireEvent.submit(button.closest("form")!);
    await waitFor(()=>expect(mocks.timelineCreate).toHaveBeenCalledTimes(1));
    const fd=mocks.timelineCreate.mock.calls[0][3] as FormData;
    expect(fd.get("event_name")).toBe("Polish institutions targeted");
    expect(fd.get("description")).toBe("Source reports targeting activity.");
    expect(fd.get("time_precision")).toBe("DAY");
    expect(fd.get("event_date")).toBe("2026-10-21");
  });
  it("leaves vague Timeline date unfilled and keeps original time wording",()=>{
    render(<AnnotationTimelineActions projectId={projectId} sourceId={sourceId}
      annotation={annotation} events={[]} links={[]}
      aiCandidate={{...timeline,candidateId:"test-vague",sourceTimeExpression:"summer 2023",
        normalizedDate:null,temporalPrecision:"SEASON"}}/>);
    expect(screen.getByDisplayValue("summer 2023")).toBeTruthy();
    expect((screen.getByLabelText("When") as HTMLInputElement).value).toBe("");
    expect(mocks.timelineCreate).not.toHaveBeenCalled();
  });
  it("prefills Source Claim with AI_SUGGESTED and only creates on analyst submit",async()=>{
    render(<SourceClaimProcessingPanel projectId={projectId} sourceId={sourceId}
      annotation={annotation} claims={[]} assertions={[]} aiCandidate={claim}/>);
    expect(screen.getByDisplayValue("The operation targeted Polish institutions.")).toBeTruthy();
    expect(screen.getByDisplayValue("According to the source")).toBeTruthy();
    expect(mocks.claimCreate).not.toHaveBeenCalled();
    const button=screen.getByRole("button",{name:"Create Source Claim"});
    const form=button.closest("form")!;
    expect((form.querySelector('[name="mapping_origin"]') as HTMLSelectElement).value).toBe("AI_SUGGESTED");
    fireEvent.submit(form);
    await waitFor(()=>expect(mocks.claimCreate).toHaveBeenCalledTimes(1));
    const fd=mocks.claimCreate.mock.calls[0][3] as FormData;
    expect(fd.get("claim_summary")).toBe("The operation targeted Polish institutions.");
    expect(fd.get("mapping_origin")).toBe("AI_SUGGESTED");
  });
});
