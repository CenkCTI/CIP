import {describe,expect,it} from "vitest";
import {OTX_BOUNDARY_MAX,parseOtxCursor,serializeOtxCursor} from "./cursor";
const ts="2026-08-01T10:00:00.000Z",id="0123456789abcdef01234567";
const raw=(overrides:Record<string,unknown>={})=>JSON.stringify({schema_version:1,provider:"ALIENVAULT_OTX",last_modified:ts,pulse_ids_at_boundary:[id],...overrides});
describe("strict OTX cursor contract",()=>{
 it("accepts a valid cursor",()=>expect(parseOtxCursor(raw())).toEqual({schema_version:1,provider:"ALIENVAULT_OTX",last_modified:ts,pulse_ids_at_boundary:[id]}));
 it("serializes canonical UTC",()=>expect(JSON.parse(serializeOtxCursor(ts,[id])).last_modified).toBe(ts));
 it.each([["wrong provider",{provider:"THREATFOX"}],["unsupported version",{schema_version:2}],["invalid timestamp",{last_modified:"2026-08-01T10:00:00Z"}],["invalid Pulse ID",{pulse_ids_at_boundary:["abc"]}],["duplicate IDs",{pulse_ids_at_boundary:[id,id]}],["unsorted IDs",{pulse_ids_at_boundary:["1123456789abcdef01234567",id]}],["excessive IDs",{pulse_ids_at_boundary:Array.from({length:OTX_BOUNDARY_MAX+1},(_,i)=>i.toString(16).padStart(24,"0"))}]])("rejects %s",(_label,value)=>expect(()=>parseOtxCursor(raw(value))).toThrow("OTX_CURSOR_INVALID"));
 it("rejects malformed JSON",()=>expect(()=>parseOtxCursor("not-json-secret")).toThrow("OTX_CURSOR_INVALID"));
 it("rejects serialized input over 1000 bytes",()=>expect(()=>parseOtxCursor("{"+"x".repeat(1001))).toThrow("OTX_CURSOR_INVALID"));
 it("does not expose cursor content",()=>{try{parseOtxCursor("raw-cursor-secret")}catch(error){expect(String(error)).toBe("OtxError: OTX_CURSOR_INVALID");expect(JSON.stringify(error)).not.toContain("raw-cursor-secret")}});
});
