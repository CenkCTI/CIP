import React from "react";
import { Document, Page, Text, renderToBuffer } from "@react-pdf/renderer";
import { describe, expect, it } from "vitest";

describe("CİTEM PDF Turkish text", () => {
  it("renders Turkish analyst-facing text without font encoding errors", async () => {
    const output = await renderToBuffer(
      <Document>
        <Page>
          <Text>CİTEM İşaretli Çalışma Kopyası</Text>
          <Text>Bilgi Açığı · Toplama Gereksinimi · Kaynak Köken Bilgisi</Text>
          <Text>Ğğ İı Şş Çç Öö Üü</Text>
        </Page>
      </Document>,
    );

    expect(output.byteLength).toBeGreaterThan(100);
  });
});
