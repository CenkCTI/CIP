import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { IocInbox } from "./ioc-inbox";
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:vi.fn()})}));
vi.mock("@/app/osint/ioc-actions",()=>({acceptIocCandidate:vi.fn(),changeIocConnectionState:vi.fn(),connectThreatFox:vi.fn(),disconnectThreatFox:vi.fn(),ensureSyntheticIocConnection:vi.fn(),saveThreatFoxSettings:vi.fn(),syncIocProviderConnection:vi.fn(),triageIocCandidate:vi.fn()}));
const filters={view:"iocs" as const,ioc_q:"",ioc_status:"" as const,ioc_type:"" as const,ioc_provider:"",ioc_sort:"last" as const,ioc_min_confidence:"" as const,ioc_max_confidence:"" as const,ioc_port:"" as const,ioc_project:"",ioc_cursor:""};
describe("manual IOC synchronization deployment",()=>{it("shows the neutral deployment note without polling or background requests",()=>{const fetchSpy=vi.spyOn(globalThis,"fetch"),timerSpy=vi.spyOn(globalThis,"setTimeout");render(<IocInbox rows={[]} projects={[]} connections={[]} runs={[]} sources={{}} filters={filters} nextHref={null} syntheticEnabled={false}/>);expect(screen.getByRole("note")).toHaveTextContent("Automatic provider synchronization is not enabled in this deployment. Use Sync now to check for new observations.");expect(fetchSpy).not.toHaveBeenCalled();expect(timerSpy).not.toHaveBeenCalled();});});
