import {render,screen,within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {describe,expect,it,vi} from "vitest";
import {AnnotationProcessingActions} from "@/components/investigations/source-reader/annotation-processing-actions";

vi.mock("next/navigation",()=>({useRouter:()=>({refresh:vi.fn()})}));
vi.mock("@/app/projects/[id]/source-processing-actions",()=>({
 createAnnotationOutput:vi.fn(),linkAnnotationOutput:vi.fn(),
 processAnnotationIndicatorBatch:vi.fn(),setAnnotationProcessingState:vi.fn(),unlinkAnnotationOutput:vi.fn()
}));
vi.mock("@/app/projects/[id]/timeline-actions",()=>({
 createTimelineEventFromAnnotation:vi.fn(),linkAnnotationToTimelineEvent:vi.fn()
}));
vi.mock("@/app/projects/[id]/source-processing-actions",()=>({
 createAnnotationOutput:vi.fn(),linkAnnotationOutput:vi.fn(),
 processAnnotationIndicatorBatch:vi.fn(),setAnnotationProcessingState:vi.fn(),unlinkAnnotationOutput:vi.fn(),
 createSourceClaimFromAnnotation:vi.fn(),linkSourceClaimFromAnnotation:vi.fn(),unlinkSourceClaimAssertion:vi.fn()
}));
describe("nested Fusion Stage 3 processing dialog keyboard behavior",()=>{
 it("focuses the processing dialog and restores focus on Escape",async()=>{
  const user=userEvent.setup();
  render(<AnnotationProcessingActions
   projectId="11111111-1111-4111-8111-111111111111"
   sourceId="22222222-2222-4222-8222-222222222222"
   annotation={{id:"33333333-3333-4333-8333-333333333333",
    selected_text:"CERT Polska reported malware targeting government institutions.",
    page_number:1,annotation_type:"HIGHLIGHT",processing_state:"UNPROCESSED"}}
   events={[]} timelineLinks={[]} outputs={[]} sourceClaimAssertions={[]}
   options={{indicator:[],malware:[],cve:[],mitre:[],campaign:[],actor:[],source_claim:[]}}
  />);
  const opener=screen.getByRole("button",{name:"Process / Extract"});
  await user.click(opener);
  const dialog=screen.getByRole("dialog",{name:"Process source annotation"});
  expect(within(dialog).getByRole("button",{name:"Close"})).toHaveFocus();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog",{name:"Process source annotation"})).not.toBeInTheDocument();
  expect(opener).toHaveFocus();
 });
});
