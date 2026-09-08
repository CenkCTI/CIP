import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { nodeGet } from "./client";

const token = "unit-test-secret-" + "a".repeat(32);
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "test");
  process.env.BAYKUSH_NODE_BASE_URL = "http://node.test";
  process.env.BAYKUSH_NODE_API_TOKEN = token;
  process.env.BAYKUSH_NODE_TIMEOUT_MS = "1000";
});
afterEach(() => vi.useRealTimers());

describe("BAYKUSH Node trusted transport", () => {
  it("sends the token only as a server GET authorization header and validates JSON", async () => {
    const fetchImpl=vi.fn().mockResolvedValue(new Response(JSON.stringify({ok:true}),{status:200}));
    expect(await nodeGet("/v1/test",z.object({ok:z.literal(true)}),{fetchImpl})).toEqual({ok:true});
    expect(fetchImpl).toHaveBeenCalledWith("http://node.test/v1/test",expect.objectContaining({method:"GET",headers:expect.objectContaining({authorization:`Bearer ${token}`})}));
    expect(JSON.stringify(fetchImpl.mock.calls[0]?.[1])).not.toContain("NEXT_PUBLIC");
  });
  it("fails closed on invalid schemas",async()=>{const fetchImpl=vi.fn().mockResolvedValue(new Response("{}",{status:200}));await expect(nodeGet("/v1/test",z.object({ok:z.literal(true)}),{fetchImpl})).rejects.toMatchObject({code:"INVALID_RESPONSE"});});
  it.each([
    [401,"UNAUTHORIZED"],[403,"FORBIDDEN"],[429,"RATE_LIMITED"],[400,"INVALID_REQUEST"],[404,"NOT_FOUND"],[500,"REMOTE_ERROR"],
  ] as const)("classifies HTTP %i safely",async(status,code)=>{
    const error=await nodeGet("/v1/test",z.unknown(),{fetchImpl:vi.fn().mockResolvedValue(new Response(JSON.stringify({error:{code:"SAFE"},credential:token}),{status,headers:status===429?{"retry-after":"12"}:undefined}))}).catch(value=>value);
    expect(error).toMatchObject({code,status});
    if(status===429)expect((error as {retryAfterSeconds:number}).retryAfterSeconds).toBe(12);
    expect(JSON.stringify(error)).not.toContain(token);
  });
  it("maps unreachable and timed-out requests to unavailable without leaking errors",async()=>{
    const rejected=await nodeGet("/v1/test",z.unknown(),{fetchImpl:vi.fn().mockRejectedValue(new Error(token))}).catch(value=>value);
    expect(rejected).toMatchObject({code:"UNAVAILABLE"});expect(JSON.stringify(rejected)).not.toContain(token);
    const aborted=await nodeGet("/v1/test",z.unknown(),{fetchImpl:vi.fn(()=>Promise.reject(new DOMException(token,"AbortError")))}).catch(value=>value);
    expect(aborted).toMatchObject({code:"UNAVAILABLE"});expect(JSON.stringify(aborted)).not.toContain(token);
  });
  it("rejects absolute and protocol-relative request targets",async()=>{
    await expect(nodeGet("https://evil.test",z.unknown())).rejects.toMatchObject({code:"INVALID_REQUEST"});
    await expect(nodeGet("//evil.test",z.unknown())).rejects.toMatchObject({code:"INVALID_REQUEST"});
  });
});
