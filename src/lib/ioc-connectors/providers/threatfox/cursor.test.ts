import {describe,expect,it} from "vitest";
import {decimalProviderId,parseThreatFoxCursor,serializeThreatFoxCursor,THREATFOX_CURSOR_MAX_BYTES,THREATFOX_ID_MAX_DIGITS} from "./cursor";
const v2={schema_version:2,provider:"THREATFOX",max_id:"123456",max_first_seen:"2026-08-01T10:00:00.000Z"};
describe("ThreatFox cursor v2",()=>{
 it("treats a missing cursor as bootstrap",()=>expect(parseThreatFoxCursor(null)).toBeNull());
 it("accepts and deterministically serializes v2",()=>expect(parseThreatFoxCursor(serializeThreatFoxCursor(v2.max_id,v2.max_first_seen))).toEqual(v2));
 it("upgrades safe numeric and decimal-string legacy v1 cursors in memory",()=>{expect(parseThreatFoxCursor(JSON.stringify({schema_version:1,max_id:123,max_first_seen:null}))).toMatchObject({schema_version:2,provider:"THREATFOX",max_id:"123"});expect(parseThreatFoxCursor(JSON.stringify({schema_version:1,max_id:"9007199254740993",max_first_seen:null}))).toMatchObject({max_id:"9007199254740993"});});
 it.each(["not-json",JSON.stringify({...v2,provider:"OTHER"}),JSON.stringify({...v2,schema_version:3}),JSON.stringify({...v2,max_id:"-1"}),JSON.stringify({...v2,max_id:"1.5"}),JSON.stringify({...v2,max_id:"1e3"}),JSON.stringify({...v2,max_id:" 1"}),JSON.stringify({...v2,max_id:"x"}),JSON.stringify({...v2,max_id:"1".repeat(THREATFOX_ID_MAX_DIGITS+1)}),JSON.stringify({schema_version:1,max_id:9007199254740992,max_first_seen:null})," ".repeat(THREATFOX_CURSOR_MAX_BYTES+1)])("fails closed for malformed/unsafe cursor %#",value=>expect(()=>parseThreatFoxCursor(value)).toThrow("THREATFOX_CURSOR_INVALID"));
 it("does not leak cursor contents in its error",()=>{let error:unknown;try{parseThreatFoxCursor('{secret-cursor-value}')}catch(caught){error=caught}expect(JSON.stringify(error)).not.toContain("secret-cursor-value");});
 it("accepts provider IDs without Number precision loss",()=>{expect(decimalProviderId("900719925474099312345")).toBe("900719925474099312345");expect(decimalProviderId(9007199254740992)).toBeNull();});
});
