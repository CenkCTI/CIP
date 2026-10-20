import path from "node:path";
import { Font } from "@react-pdf/renderer";

// Bundled SIL Open Font License Figtree faces; no request-time network calls.
export const CITEM_REPORT_FONT_FAMILY="CitemReportFigtree";
let registered=false;
export function ensureCitemReportFonts(){
  if(registered)return;
  const dir=path.join(process.cwd(),"src","lib","reports","assets");
  Font.register({
    family:CITEM_REPORT_FONT_FAMILY,
    fonts:[
      {src:path.join(dir,"figtree-regular.ttf"),fontWeight:400},
      {src:path.join(dir,"figtree-bold.ttf"),fontWeight:700},
      {src:path.join(dir,"figtree-italic.ttf"),fontWeight:400,fontStyle:"italic"},
    ],
  });
  registered=true;
}
