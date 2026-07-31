import { brotliCompressSync, gzipSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import { normalizeFeedUrl, normalizeItemUrl, redactUrl } from "@/lib/research-feeds/url";
import { createPinnedLookup, fetchFeed, isPublicAddress, resolvePublic, type Transport, type TransportResponse } from "@/lib/research-feeds/network";
import { parseFeed } from "@/lib/research-feeds/parser";
import { itemFingerprints } from "@/lib/research-feeds/fingerprint";

const rss=`<?xml version="1.0"?><rss version="2.0"><channel><title>x</title><item><guid>1</guid><title>Hello</title><link>/post#x</link><description><![CDATA[<script>bad()</script><b>Safe</b>]]></description><pubDate>bad</pubDate><category>A</category></item></channel></rss>`;
const atom=`<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>x</title><entry><id>1</id><title>Atom</title><link rel="alternate" href="https://example.com/a"/><summary>Body</summary></entry></feed>`;
const resolver=async()=>[{address:"93.184.216.34",family:4}];
function body(value:Uint8Array|string){const bytes=typeof value==="string"?Buffer.from(value):value;return{async *[Symbol.asyncIterator](){yield bytes;},destroy:vi.fn()};}
function response(status:number,headers:Record<string,string>={},value:Uint8Array|string=""):TransportResponse{return{status,headers,body:body(value),cleanup:vi.fn()};}

describe("feed URL validation",()=>{
 it.each(["http://example.com/feed","https://EXAMPLE.com/a/../feed?q=x"])("accepts %s",url=>expect(normalizeFeedUrl(url).hostname).toBe("example.com"));
 it.each(["ftp://example.com/x","https://u:p@example.com/x","https://example.com/x#f","http://localhost/x","http://internal/x","https://example.com:8443/x","not url","https://example.com/%0aevil"])("rejects %s",url=>expect(()=>normalizeFeedUrl(url)).toThrow());
 it("redacts query values",()=>expect(redactUrl("https://example.com/a?token=secret")).not.toContain("secret"));
});

describe("pinned Node lookup contract and safe transport diagnostics",()=>{
 it("returns a pinned IPv4 address for all=false without resolving the hostname",async()=>{const lookup=createPinnedLookup({address:"93.184.216.34",family:4});const callback=vi.fn();lookup("must-not-resolve.invalid",{all:false},callback);expect(callback).toHaveBeenCalledWith(null,"93.184.216.34",4);});
 it("returns a pinned IPv4 array for all=true",async()=>{const lookup=createPinnedLookup({address:"93.184.216.34",family:4});const callback=vi.fn();lookup("must-not-resolve.invalid",{all:true},callback);expect(callback).toHaveBeenCalledWith(null,[{address:"93.184.216.34",family:4}]);});
 it("preserves a pinned IPv6 address for both lookup overloads",()=>{const lookup=createPinnedLookup({address:"2606:2800:220:1:248:1893:25c8:1946",family:6});const single=vi.fn();const all=vi.fn();lookup("must-not-resolve.invalid",{all:false},single);lookup("must-not-resolve.invalid",{all:true},all);expect(single).toHaveBeenCalledWith(null,"2606:2800:220:1:248:1893:25c8:1946",6);expect(all).toHaveBeenCalledWith(null,[{address:"2606:2800:220:1:248:1893:25c8:1946",family:6}]);});
 it.each([["ENOTFOUND","DNS_FAILED"],["EAI_AGAIN","DNS_FAILED"],["UND_ERR_CONNECT_TIMEOUT","CONNECTION_TIMEOUT"],["ETIMEDOUT","CONNECTION_TIMEOUT"]])("maps %s without exposing raw messages",async(code,expected)=>{await expect(fetchFeed("https://example.com/feed",{}, {resolver,transport:async()=>{throw Object.assign(new Error("raw secret"),{code});}})).rejects.toMatchObject({code:expected});});
 it("maps overall deadline aborts to REQUEST_TIMEOUT",async()=>{await expect(fetchFeed("https://example.com/feed",{}, {resolver,totalMs:5,transport:()=>new Promise(()=>{})})).rejects.toMatchObject({code:"REQUEST_TIMEOUT"});});
 it("logs only structured safe fields for unexpected transport errors",async()=>{const log=vi.spyOn(console,"error").mockImplementation(()=>undefined);try{await expect(fetchFeed("https://example.com/feed?token=URL_SECRET",{}, {resolver,diagnostic:{feedSourceId:"feed-id",fetchRunId:"run-id"},transport:async()=>{throw Object.assign(new Error("BODY_SECRET 10.0.0.1 Authorization Cookie"),{name:"TransportError",headers:{authorization:"SERVICE_KEY"}});}})).rejects.toMatchObject({code:"INTERNAL_ERROR"});const output=log.mock.calls.flat().join(" ");expect(output).toContain('"stage":"REQUEST"');expect(output).toContain('"code":"INTERNAL_ERROR"');expect(output).toContain('"feedSourceId":"feed-id"');expect(output).not.toMatch(/URL_SECRET|BODY_SECRET|10\.0\.0\.1|Authorization|Cookie|SERVICE_KEY|example\.com/);}finally{log.mockRestore();}});
});
describe("address classification and deadline",()=>{
 it.each(["127.0.0.1","10.0.0.1","169.254.169.254","192.0.2.1","224.0.0.1","::1","fc00::1","fe80::1","2001:db8::1","::ffff:127.0.0.1"])("blocks %s",address=>expect(isPublicAddress(address)).toBe(false));
 it("allows global addresses",()=>expect(isPublicAddress("93.184.216.34")).toBe(true));
 it("rejects mixed DNS",async()=>await expect(resolvePublic("example.com",new AbortController().signal,async()=>[{address:"93.184.216.34",family:4},{address:"10.0.0.1",family:4}])).rejects.toMatchObject({code:"DNS_BLOCKED"}));
 it("applies the total deadline to DNS",async()=>await expect(fetchFeed("https://example.com",{}, {totalMs:5,resolver:()=>new Promise(()=>{})})).rejects.toMatchObject({code:"REQUEST_TIMEOUT"}));
});
describe("protected transport, cleanup, redirects and compression",()=>{
 it("pins the validated address and sends controlled headers",async()=>{const transport=vi.fn<Transport>(async()=>response(304));await fetchFeed("https://example.com/feed",{}, {resolver,transport});expect(transport.mock.calls[0]?.[1]).toEqual({address:"93.184.216.34",family:4});expect(transport.mock.calls[0]?.[2]).not.toHaveProperty("authorization");expect(transport.mock.calls[0]?.[2]).not.toHaveProperty("cookie");});
 it("cleans body and transport after success",async()=>{const r=response(200,{"content-type":"application/xml"},rss);await fetchFeed("https://example.com",{}, {resolver,transport:async()=>r});expect(r.body.destroy).toHaveBeenCalled();expect(r.cleanup).toHaveBeenCalled();});
 it("cleans resources after HTTP failure",async()=>{const r=response(500);await expect(fetchFeed("https://example.com",{}, {resolver,transport:async()=>r})).rejects.toMatchObject({code:"HTTP_ERROR"});expect(r.cleanup).toHaveBeenCalled();});
 it("cleans redirect bodies",async()=>{const first=response(302,{location:"https://example.com/next"});const second=response(304);let count=0;await fetchFeed("https://example.com",{}, {resolver,transport:async()=>++count===1?first:second});expect(first.body.destroy).toHaveBeenCalled();expect(first.cleanup).toHaveBeenCalled();});
 it("strips validators after a cross-origin redirect",async()=>{const headers:Record<string,string>[]=[];let count=0;await fetchFeed("https://example.com",{etag:'"x"',lastModified:"Wed, 21 Oct 2015 07:28:00 GMT"},{resolver,transport:async(_url,_address,h)=>{headers.push(h);return++count===1?response(302,{location:"https://other.example/feed"}):response(304);}});expect(headers[0]).toHaveProperty("if-none-match");expect(headers[1]).not.toHaveProperty("if-none-match");expect(headers[1]).not.toHaveProperty("if-modified-since");});
 it("blocks private redirects",async()=>{let count=0;await expect(fetchFeed("https://example.com",{}, {resolver:async host=>host==="private.example"?[{address:"10.0.0.1",family:4}]:resolver(),transport:async()=>++count===1?response(302,{location:"https://private.example/feed"}):response(200)})).rejects.toMatchObject({code:"DNS_BLOCKED"});});
 it("rejects HTTPS downgrade",async()=>await expect(fetchFeed("https://example.com",{}, {resolver,transport:async()=>response(302,{location:"http://example.com/feed"})})).rejects.toMatchObject({code:"REDIRECT_BLOCKED"}));
 it("decodes bounded gzip RSS",async()=>expect((await fetchFeed("https://example.com",{}, {resolver,transport:async()=>response(200,{"content-type":"application/rss+xml","content-encoding":"gzip"},gzipSync(rss))})).body).toContain("<rss"));
 it("decodes bounded Brotli Atom",async()=>expect((await fetchFeed("https://example.com",{}, {resolver,transport:async()=>response(200,{"content-type":"application/atom+xml","content-encoding":"br"},brotliCompressSync(atom))})).body).toContain("<feed"));
 it("rejects corrupted compression and cleans resources",async()=>{const r=response(200,{"content-type":"application/xml","content-encoding":"gzip"},"bad");await expect(fetchFeed("https://example.com",{}, {resolver,transport:async()=>r})).rejects.toMatchObject({code:"CONTENT_TYPE_REJECTED"});expect(r.cleanup).toHaveBeenCalled();});
 it("rejects decompression bombs",async()=>await expect(fetchFeed("https://example.com",{}, {resolver,transport:async()=>response(200,{"content-type":"application/xml","content-encoding":"gzip"},gzipSync("x".repeat(5*1024*1024+1)))})).rejects.toMatchObject({code:"RESPONSE_TOO_LARGE"}));
 it("rejects multiple encodings",async()=>await expect(fetchFeed("https://example.com",{}, {resolver,transport:async()=>response(200,{"content-type":"application/xml","content-encoding":"gzip, br"},rss)})).rejects.toMatchObject({code:"CONTENT_TYPE_REJECTED"}));
 it("rejects HTML",async()=>await expect(fetchFeed("https://example.com",{}, {resolver,transport:async()=>response(200,{"content-type":"text/html"},rss)})).rejects.toMatchObject({code:"CONTENT_TYPE_REJECTED"}));
});
describe("feed parsing and normalization",()=>{
 it("parses safe RSS",()=>expect(parseFeed(rss,"https://example.com/feed").items[0]).toMatchObject({title:"Hello",canonicalUrl:"https://example.com/post",summaryText:"Safe",publishedAt:null}));
 it("parses Atom alternate links",()=>expect(parseFeed(atom,"https://example.com").items[0]?.canonicalUrl).toBe("https://example.com/a"));
 it.each(["<!DOCTYPE rss><rss/>","<!ENTITY x SYSTEM 'file:///etc/passwd'><rss/>"])("rejects unsafe XML",xml=>expect(()=>parseFeed(xml,"https://example.com")).toThrow());
 it("rejects malformed nesting",()=>expect(()=>parseFeed("<rss><channel></rss>","https://example.com")).toThrow());
 it("supports Unicode and namespaced elements",()=>expect(parseFeed(`<?xml version="1.0"?><rss><channel><başlık>x</başlık><item><title>A</title><content:encoded>B</content:encoded></item></channel></rss>`,"https://example.com").items).toHaveLength(1));
 it("rejects excessive parser-native depth",()=>expect(()=>parseFeed(`<rss><channel>${"<x>".repeat(50)}a${"</x>".repeat(50)}</channel></rss>`,"https://example.com")).toThrow());
 it("enforces item limit",()=>{const xml=`<rss><channel>${Array.from({length:501},(_,index)=>`<item><title>${index}</title></item>`).join("")}</channel></rss>`;expect(parseFeed(xml,"https://example.com").items).toHaveLength(500)});
 it("skips unusable items",()=>expect(parseFeed("<rss><channel><item><guid>x</guid></item></channel></rss>","https://example.com").items).toHaveLength(0));
 it("normalizes item URLs",()=>expect(normalizeItemUrl("/a#b","https://example.com/feed")).toBe("https://example.com/a"));
 it("fingerprints deterministically",()=>{const item=parseFeed(atom,"https://example.com").items[0]!;expect(itemFingerprints(item)).toEqual(itemFingerprints(item));});
});
