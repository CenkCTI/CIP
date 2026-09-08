import { describe, expect, it } from "vitest";
import { nodeConfig } from "./config";

const token = "x".repeat(32);
describe("production Node configuration",()=>{
  it("requires HTTPS, a non-local host, an explicit bounded timeout, and a server token",()=>{
    const valid:NodeJS.ProcessEnv={NODE_ENV:"production",BAYKUSH_NODE_BASE_URL:"https://node.example.test",BAYKUSH_NODE_API_TOKEN:token,BAYKUSH_NODE_TIMEOUT_MS:"9000"};
    expect(nodeConfig(valid)).toMatchObject({baseUrl:"https://node.example.test",timeoutMs:9000});
    for(const candidate of [
      {...valid,BAYKUSH_NODE_BASE_URL:"http://node.example.test"},
      {...valid,BAYKUSH_NODE_BASE_URL:"https://localhost:8080"},
      {...valid,BAYKUSH_NODE_BASE_URL:"ftp://node.example.test"},
      {...valid,BAYKUSH_NODE_BASE_URL:"https://user:secret@node.example.test/v1?token=x"},
      {...valid,BAYKUSH_NODE_TIMEOUT_MS:undefined},
      {...valid,BAYKUSH_NODE_TIMEOUT_MS:"999999"},
      {...valid,BAYKUSH_NODE_API_TOKEN:undefined},
    ] as NodeJS.ProcessEnv[])expect(()=>nodeConfig(candidate)).toThrow("BAYKUSH_NODE_NOT_CONFIGURED");
  });
  it("keeps the local HTTP development example usable",()=>expect(nodeConfig({NODE_ENV:"development",BAYKUSH_NODE_BASE_URL:"http://127.0.0.1:8080",BAYKUSH_NODE_API_TOKEN:token})).toMatchObject({timeoutMs:9000}));
});
