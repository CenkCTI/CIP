import path from "node:path";
import { Font } from "@react-pdf/renderer";

// Scoped to the report exporter: the PDF.js-provided regular subset renders
// invisibly in some PDF engines. Use the verified readable bold outlines as
// a temporary, self-contained fallback until a licensed regular face ships.
export const CITEM_REPORT_FONT_FAMILY = "CitemReportSans";
let registered=false;
export function ensureCitemReportFonts(){
  if(registered)return;
  const standard=path.join(process.cwd(),"node_modules","pdfjs-dist","standard_fonts");
  Font.register({
    family:CITEM_REPORT_FONT_FAMILY,
    fonts:[
      {src:path.join(standard,"LiberationSans-Bold.ttf"),fontWeight:400},
      {src:path.join(standard,"LiberationSans-Bold.ttf"),fontWeight:700},
      {src:path.join(standard,"LiberationSans-BoldItalic.ttf"),fontWeight:400,fontStyle:"italic"},
      {src:path.join(standard,"LiberationSans-BoldItalic.ttf"),fontWeight:700,fontStyle:"italic"},
    ],
  });
  registered=true;
}
