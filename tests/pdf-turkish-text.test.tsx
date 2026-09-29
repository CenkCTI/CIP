import React from "react";
import { Document, Page, StyleSheet, Text, renderToBuffer } from "@react-pdf/renderer";
import { describe, expect, it } from "vitest";

import {
  CITEM_PDF_FONT_FAMILY,
  ensureCitemPdfFonts,
} from "@/lib/collection/pdf-fonts";

const styles = StyleSheet.create({
  page: { fontFamily: CITEM_PDF_FONT_FAMILY },
});

describe("CITEM PDF Unicode text", () => {
  it("renders Turkish analyst-facing text without font encoding errors", async () => {
    ensureCitemPdfFonts();

    const output = await renderToBuffer(
      <Document>
        <Page style={styles.page}>
          <Text>CİTEM İşaretli Çalışma Kopyası</Text>
          <Text>Bilgi Açığı · Toplama Gereksinimi · Kaynak Köken Bilgisi</Text>
          <Text>Ğğ İı Şş Çç Öö Üü</Text>
        </Page>
      </Document>,
    );

    expect(output.byteLength).toBeGreaterThan(100);
  });
});
