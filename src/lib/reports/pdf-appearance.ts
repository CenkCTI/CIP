/** PDF export appearance is a presentation option, never part of the report snapshot. */
export const REPORT_PDF_APPEARANCES = [
  {value:"original",label:"Orijinal"},
  {value:"forest",label:"Koyu Yeşil"},
  {value:"night",label:"Gece Siyahı"},
] as const;

export type ReportPdfAppearance = (typeof REPORT_PDF_APPEARANCES)[number]["value"];
export const REPORT_PDF_APPEARANCE_STORAGE_KEY = "citem:report-pdf-appearance:v1";

export function isReportPdfAppearance(value:unknown):value is ReportPdfAppearance {
  return value==="original"||value==="forest"||value==="night";
}

export function parseReportPdfAppearance(value:unknown):ReportPdfAppearance {
  return isReportPdfAppearance(value)?value:"original";
}

/** Server-side semantic palette. Original is handled by the existing branded
 * styles with no modifications. Dark pages use real PDF fills and text colors,
 * not a postprocessing bitmap filter.
 */
export const DARK_REPORT_PDF_PALETTES = {
  forest: {
    charcoal:"#12231e",charcoalSoft:"#233e32",
    amber:"#B9822F",amberDark:"#E2B777",amberLight:"#F0CB8C",
    ink:"#E6EEE9",secondary:"#B9CDC0",rule:"#3E5D50",
    paper:"#182B25",panel:"#223B32",white:"#2A4238",
  },
  night: {
    charcoal:"#0F1113",charcoalSoft:"#22262B",
    amber:"#B9822F",amberDark:"#E0B87E",amberLight:"#F0C78B",
    ink:"#E3E6E8",secondary:"#BAC2C8",rule:"#444A50",
    paper:"#151719",panel:"#23282D",white:"#292F34",
  },
} as const;
