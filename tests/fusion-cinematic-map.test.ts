import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Hashes of the original user-approved pack, before any rendering/CSS.
const sources = [
 ["01_onaylanan_ana_harita.png", "300d6dbf31a15fdef5f75fae4079cbc9113d843472f09bfde0bbd334af8babca"],
 ["02_gece_sehir_isiklari_RGBA.png", "72836ed7b7462a82584cb9b121ad132933b796180610421f5ca49809dba97bdb"],
 ["03_atmosfer_bulut_RGBA.png", "72d94d414fe670452af9befc1b2ebdae0e639bba02d1a18b0098a6984a5960d2"],
 ["04_ulke_sinirlari_RGBA.png", "67fcd8bc7c058be080b4fac3ccdfabb2c308da2a3ca2bc3e3ef11b63b5f75d0d"],
 ["05_ulke_isimleri_RGBA.png", "e6100bb9aa3136846e3e0e0ffd4c8eca39dd862d3a1b1fe5166608c4efd38c83"],
 ["06_okyanus_yazilari_grid_RGBA.png", "dc1c1a6d6cb307d1cf34b2a7c2d2c0b1868864a223c044f77fc6f1b6d3a11493"],
 ["07_hud_gorsel_referans_RGBA.png", "aef484ed201baf9c1ee2aeab42ee4c43b23ec28121b966afad108e4796073d0c"],
];

describe("Approved CİTEM Dark Atlas source integrity", () => {
 it.each(sources)("preserves the original aligned PNG: %s", (name, hash) => {
  const bytes=readFileSync(`public/fusion/atlas/${name}`);
  expect(bytes.subarray(0,8)).toEqual(Buffer.from([137,80,78,71,13,10,26,10]));
  expect([bytes.readUInt32BE(16),bytes.readUInt32BE(20)]).toEqual([1774,887]);
  expect(bytes[25]).toBe(name.startsWith("01_")?2:6);
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(hash);
 });
});
