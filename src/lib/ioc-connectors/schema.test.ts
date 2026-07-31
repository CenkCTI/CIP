import { describe, expect, it } from "vitest";
import { decodeIocCursor, encodeIocCursor, inboxQuery, iocInboxSchema } from "./schema";
describe("IOC Inbox query state", () => {
  it("validates every filter and preserves it in pagination", () => { const filters = iocInboxSchema.parse({ view: "iocs", ioc_q: "example", ioc_status: "NEW", ioc_type: "DOMAIN", ioc_provider: "10000000-0000-4000-8000-000000000001", ioc_sort: "confidence", ioc_min_confidence: "20", ioc_max_confidence: "90", ioc_port: "absent", ioc_project: "20000000-0000-4000-8000-000000000001" }); const cursor = encodeIocCursor({ sort: "confidence", value: 50, id: "30000000-0000-4000-8000-000000000001" }); const url = inboxQuery(filters, cursor); expect(url).toContain("ioc_provider=10000000"); expect(url).toContain("ioc_sort=confidence"); expect(url).toContain("ioc_cursor="); expect(decodeIocCursor(cursor)).toEqual({ sort: "confidence", value: 50, id: "30000000-0000-4000-8000-000000000001" }); });
  it("rejects malformed filters and cursors", () => { expect(iocInboxSchema.safeParse({ view: "iocs", ioc_sort: "offset" }).success).toBe(false); expect(decodeIocCursor("not-a-cursor")).toBeNull(); });
});
