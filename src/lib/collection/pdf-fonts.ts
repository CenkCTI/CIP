import path from "node:path";

import { Font } from "@react-pdf/renderer";

export const CITEM_PDF_FONT_FAMILY = "CitemLiberationSans";

let registered = false;

export function ensureCitemPdfFonts() {
  if (registered) return;

  const standardFonts = path.join(
    process.cwd(),
    "node_modules",
    "pdfjs-dist",
    "standard_fonts",
  );

  Font.register({
    family: CITEM_PDF_FONT_FAMILY,
    fonts: [
      {
        src: path.join(standardFonts, "LiberationSans-Regular.ttf"),
        fontWeight: 400,
      },
      {
        src: path.join(standardFonts, "LiberationSans-Bold.ttf"),
        fontWeight: 700,
      },
    ],
  });

  registered = true;
}
