import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ByokConnectionPanel } from "@/components/ai/byok-connection-panel";

const preferred="nvidia/nemotron-3-super-120b-a12b";
const alternative="nvidia/nemotron-3-nano-30b-a3b";

describe("NVIDIA NIM model picker",()=>{
  it("preselects Nemotron 3 Super 120B and exposes the allowlisted model IDs as real options",()=>{
    render(<ByokConnectionPanel scope="user" defaultProviderId="nvidia_nim" autoLoad={false}/>);
    expect((screen.getByLabelText("BYOK provider") as HTMLSelectElement).value).toBe("nvidia_nim");
    const picker=screen.getByLabelText("BYOK model ID") as HTMLSelectElement;
    expect(picker.tagName).toBe("SELECT");
    expect(picker.value).toBe(preferred);
    expect(screen.getByRole("option",{name:"Nemotron 3 Super 120B · Recommended"}).getAttribute("value")).toBe(preferred);
    fireEvent.change(picker,{target:{value:alternative}});
    expect(picker.value).toBe(alternative);
  });

  it("sets the preferred model when switching to NVIDIA and preserves manual model IDs for other providers",()=>{
    render(<ByokConnectionPanel scope="user" defaultProviderId="openai" autoLoad={false}/>);
    const provider=screen.getByLabelText("BYOK provider") as HTMLSelectElement;
    const manualModel=screen.getByLabelText("BYOK model ID") as HTMLInputElement;
    expect(manualModel.tagName).toBe("INPUT");
    fireEvent.change(manualModel,{target:{value:"gpt-4.1-mini"}});
    fireEvent.change(provider,{target:{value:"nvidia_nim"}});
    expect((screen.getByLabelText("BYOK model ID") as HTMLSelectElement).value).toBe(preferred);
    fireEvent.change(provider,{target:{value:"groq"}});
    const nextManual=screen.getByLabelText("BYOK model ID") as HTMLInputElement;
    expect(nextManual.tagName).toBe("INPUT");
    expect(nextManual.value).toBe("");
  });

  it("submits the chosen exact model ID without requiring text entry",async()=>{
    const mock=vi.fn().mockResolvedValue({ok:true,json:async()=>({
      connected:true,provider:"NVIDIA NIM",providerId:"nvidia_nim",model:preferred,
    })});
    vi.stubGlobal("fetch",mock);
    try {
      render(<ByokConnectionPanel scope="user" defaultProviderId="nvidia_nim" autoLoad={false}/>);
      fireEvent.change(screen.getByLabelText("BYOK API key"),{target:{value:"mock-nvidia-key-12345"}});
      fireEvent.click(screen.getByRole("button",{name:"Test and Connect"}));
      await screen.findByText(/Connected to NVIDIA NIM/);
      const [url,options]=mock.mock.calls.find(([value])=>value==="/api/ai/byok/connect")!;
      expect(url).toBe("/api/ai/byok/connect");
      expect(JSON.parse(String(options.body))).toEqual({
        providerId:"nvidia_nim",model:preferred,apiKey:"mock-nvidia-key-12345",
        scope:"user",consent:true,
      });
      expect((screen.getByLabelText("BYOK API key") as HTMLInputElement).value).toBe("");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
