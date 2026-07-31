import { render,screen,within,waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach,describe,expect,it,vi } from "vitest";

const refresh=vi.fn();
const actions=vi.hoisted(()=>({
 createResearchFeed:vi.fn(),updateResearchFeed:vi.fn(),fetchResearchFeedNow:vi.fn(),setResearchFeedEnabled:vi.fn(),archiveResearchFeed:vi.fn(),restoreResearchFeed:vi.fn(),
}));
vi.mock("next/navigation",()=>({useRouter:()=>({refresh})}));
vi.mock("@/app/projects/[id]/research-feed-actions",()=>actions);

import { ResearchFeedsWorkspace } from "@/components/research-feeds/research-feeds-workspace";

function feed(id:string,name:string){return{id,name,description:"",display_url:`https://${id}.example/feed`,enabled:true,archived_at:null,detected_feed_type:"RSS",health_status:"HEALTHY",consecutive_failures:0,last_checked_at:null,last_success_at:null,last_error_message:null,recent_item_count:0};}
function renderWorkspace(){render(<ResearchFeedsWorkspace projectId="20000000-0000-4000-8000-000000000001" feeds={[feed("one","Feed One"),feed("two","Feed Two")]} runs={[]} items={[]}/>);}
function deferred<T>(){let resolve!:(value:T)=>void;let reject!:(reason?:unknown)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}

describe("Research Feeds action feedback",()=>{
 beforeEach(()=>{vi.clearAllMocks();actions.createResearchFeed.mockResolvedValue({});actions.updateResearchFeed.mockResolvedValue({});});
 it("shows fetch success and refreshes",async()=>{actions.fetchResearchFeedNow.mockResolvedValue({success:"Feed fetched; 3 items processed."});renderWorkspace();await userEvent.click(within(screen.getByTestId("feed-card-one")).getByRole("button",{name:"Fetch now"}));expect(await screen.findByRole("status")).toHaveTextContent("Feed fetched; 3 items processed.");expect(refresh).toHaveBeenCalledOnce();});
 it("shows fetch error and refreshes",async()=>{actions.fetchResearchFeedNow.mockResolvedValue({error:"The feed request timed out."});renderWorkspace();await userEvent.click(within(screen.getByTestId("feed-card-one")).getByRole("button",{name:"Fetch now"}));expect(await screen.findByRole("alert")).toHaveTextContent("The feed request timed out.");expect(refresh).toHaveBeenCalledOnce();});
 it("recovers controls and shows a controlled error after rejection",async()=>{actions.fetchResearchFeedNow.mockRejectedValue(new Error("secret failure"));renderWorkspace();const card=within(screen.getByTestId("feed-card-one"));await userEvent.click(card.getByRole("button",{name:"Fetch now"}));expect(await screen.findByRole("alert")).toHaveTextContent("could not be completed safely");await waitFor(()=>expect(card.getByRole("button",{name:"Fetch now"})).toBeEnabled());expect(card.getByRole("button",{name:"Pause"})).toBeEnabled();expect(refresh).toHaveBeenCalledOnce();});
 it("keeps controls in other feed cards enabled while one feed is busy",async()=>{const pending=deferred<{success:string}>();actions.fetchResearchFeedNow.mockReturnValueOnce(pending.promise);renderWorkspace();const first=within(screen.getByTestId("feed-card-one"));const second=within(screen.getByTestId("feed-card-two"));await userEvent.click(first.getByRole("button",{name:"Fetch now"}));expect(first.getByRole("button",{name:"Fetching…"})).toBeDisabled();expect(second.getByRole("button",{name:"Fetch now"})).toBeEnabled();expect(second.getByRole("button",{name:"Pause"})).toBeEnabled();pending.resolve({success:"Done."});expect(await screen.findByText("Done.")).toBeInTheDocument();});
 it("renders state-action feedback for pause, archive, and restore",async()=>{actions.setResearchFeedEnabled.mockResolvedValue({success:"Feed paused."});actions.archiveResearchFeed.mockResolvedValue({error:"Archive failed."});renderWorkspace();const card=within(screen.getByTestId("feed-card-one"));await userEvent.click(card.getByRole("button",{name:"Pause"}));expect(await screen.findByText("Feed paused.")).toBeInTheDocument();await userEvent.click(card.getByRole("button",{name:"Archive"}));expect(await screen.findByText("Archive failed.")).toBeInTheDocument();expect(refresh).toHaveBeenCalledTimes(2);});
 it("renders identical persisted and transient failures only once",async()=>{actions.fetchResearchFeedNow.mockResolvedValue({error:"Request failed safely."});const persisted={...feed("one","Feed One"),last_error_message:"Request failed safely."};render(<ResearchFeedsWorkspace projectId="20000000-0000-4000-8000-000000000001" feeds={[persisted]} runs={[]} items={[]}/>);await userEvent.click(screen.getByRole("button",{name:"Fetch now"}));await waitFor(()=>expect(refresh).toHaveBeenCalledOnce());expect(screen.getAllByText("Request failed safely.")).toHaveLength(1);});
});
