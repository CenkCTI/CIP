import {describe,expect,it} from "vitest";
import {envelopeSchema,pulseIdentitySchema} from "./schema";
const pulse={id:"0123456789abcdef01234567",created:"2026-08-01T00:00:00.000Z",modified:"2026-08-01T00:00:00.000Z",indicators:[]};
describe("bounded OTX identity schemas",()=>{it("accepts strict synchronization identity",()=>expect(pulseIdentitySchema.parse(pulse).id).toBe(pulse.id));it("rejects excessive indicator arrays",()=>expect(()=>pulseIdentitySchema.parse({...pulse,indicators:Array.from({length:100001},()=>null)})).toThrow());it("rejects invalid envelopes",()=>expect(envelopeSchema.safeParse({results:"x",next:null,count:0}).success).toBe(false))});
