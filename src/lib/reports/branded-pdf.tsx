import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

import { ensureCitemReportFonts, CITEM_REPORT_FONT_FAMILY } from "./pdf-fonts";
import type { ReportDoc } from "./schema";
import { reportPdfColors, tiptapToPdfElements, type ReportPdfColors } from "./render";
import type { ReportPdfAppearance } from "./pdf-appearance";
import { attributionDisclaimer } from "./versioning";

type Row = Record<string, unknown>;

function createBrandedPdfStyles(C:ReportPdfColors,appearance:ReportPdfAppearance){
  const coverText=appearance==="original"?C.white:C.ink;
  return StyleSheet.create({
  cover: {
    height: 841.89, backgroundColor: C.charcoal, color: coverText, fontFamily: CITEM_REPORT_FONT_FAMILY,
    paddingHorizontal: 54, paddingTop: 53, paddingBottom: 42,
  },
  coverAccent: {
    position: "absolute", top: 0, left: 0, width: 13, height: "100%",
    backgroundColor: C.amber,
  },
  coverRule: {
    width: 78, height: 4, backgroundColor: C.amber, marginTop: 47, marginBottom: 26,
  },
  coverBrand: { fontSize: 18, fontWeight: 700, letterSpacing: 4, color: C.amberLight },
  coverBrandSub: { fontSize: 9, letterSpacing: 2, marginTop: 8, color: "#B4B8B9" },
  coverKicker: { fontSize: 10, letterSpacing: 2, color: C.amberLight, marginBottom: 14 },
  coverTitle: {
    fontWeight: 700, lineHeight: 1.2, color: coverText,
    marginBottom: 25,
  },
  coverType: { fontSize: 11, lineHeight: 1.7, color: "#CFD0CD" },
  coverDivider: {
    marginTop: "auto", borderTopWidth: 1, borderTopColor: "#5B4A31",
    paddingTop: 21,
  },
  coverGrid: { flexDirection: "row", justifyContent: "space-between" },
  coverMetaLabel: {
    color: C.amberLight, fontSize: 8, letterSpacing: 1.4, marginBottom: 7,
  },
  coverMetaValue: { color: coverText, fontSize: 10.4, lineHeight: 1.5 },
  coverWarning: {
    borderLeftWidth: 3, borderLeftColor: C.amber, marginTop: 23,
    paddingLeft: 10, paddingVertical: 3,
    fontSize: 9, color: "#DFD0B0", lineHeight: 1.5,
  },
  coverFoot: { marginTop: 21, fontSize: 8, letterSpacing: 1.1, color: "#989E9D" },
  body: {
    backgroundColor: C.paper, color: C.ink, fontFamily: CITEM_REPORT_FONT_FAMILY,
    fontSize: 10.3, lineHeight: 1.48,
    paddingTop: 77, paddingBottom: 63, paddingHorizontal: 51,
  },
  runningHeader: {
    position: "absolute", top: 29, left: 51, right: 51,
    borderBottomWidth: 1, borderBottomColor: C.rule,
    paddingBottom: 12, flexDirection: "row", justifyContent: "space-between",
  },
  runningBrand: { fontSize: 10.5, color: C.amberDark, fontWeight: 700, letterSpacing: 1.6 },
  runningType: { fontSize: 8.2, color: C.secondary },
  runningFooter: {
    position: "absolute", top: 785, left: 51, right: 51,
    borderTopWidth: 1, borderTopColor: C.rule, paddingTop: 10,
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
  },
  footerLabel: { color: C.secondary, fontSize: 8.2 },
  footerNo: {
    position: "absolute", top: 795, right: 51,
    color: C.amberDark, fontWeight: 700, fontSize: 8.8,
  },
  section: { marginBottom: 19 },
  sectionKicker: {
    fontSize: 8, color: C.amberDark, fontWeight: 700, letterSpacing: 1.6,
    marginBottom: 7,
  },
  sectionTitle: {
    fontSize: 17.2, fontWeight: 700, lineHeight: 1.3,
    color: appearance==="original"?C.charcoal:C.ink, marginBottom: 10,
  },
  sectionRule: { height: 2, width: 42, backgroundColor: C.amber, marginBottom: 15 },
  metaBox: {
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.rule,
    paddingVertical: 11, marginBottom: 26,
  },
  metaRow: { flexDirection: "row", marginBottom: 6 },
  metaKey: { width: 107, color: C.secondary, fontSize: 9, fontWeight: 700 },
  metaValue: { flex: 1, color: C.ink, fontSize: 9 },
  assessment: {
    marginBottom: 12, paddingVertical: 10, paddingHorizontal: 13,
    backgroundColor: C.panel, borderLeftWidth: 2, borderLeftColor: C.amber,
  },
  assessmentLabel: { color: C.amberDark, fontSize: 9, fontWeight: 700, marginBottom: 5 },
  assessmentValue: { fontSize: 10.1, color: C.ink, lineHeight: 1.5 },
  appendix: { marginTop: 13 },
  reference: {
    borderBottomWidth: 1, borderBottomColor: C.rule, paddingBottom: 11, marginBottom: 11,
  },
  referenceType: { color: C.amberDark, fontWeight: 700, fontSize: 8.4, marginBottom: 5 },
  referenceTitle: { fontSize: 10.2, color: C.ink, fontWeight: 700, marginBottom: 4 },
  referenceMeta: { color: C.secondary, fontSize: 8.7, lineHeight: 1.48 },
  disclaimer: {
    borderLeftWidth: 3, borderLeftColor: C.amber, backgroundColor: C.panel,
    padding: 12, marginTop: 6, color: C.ink, fontSize: 9.3, lineHeight: 1.5,
  },
  empty: { color: C.secondary, fontSize: 9.6, marginBottom: 10 },
  });
}

export const REPORT_PDF_SECTIONS = [
  ["Executive summary", "executive_summary_snapshot"],
  ["Key judgments", "key_judgments_snapshot"],
  ["Confidence", "confidence_snapshot"],
  ["Intelligence gaps", "intelligence_gaps_snapshot"],
  ["Recommendations", "recommendations_snapshot"],
  ["Change summary", "change_summary"],
] as const;

function value(v:unknown, fallback = "Not provided"):string {
  if(v===undefined || v===null || v==="") return fallback;
  return typeof v==="string" ? v : typeof v==="number" ? String(v) : JSON.stringify(v);
}
function date(v:unknown):string {
  if(typeof v!=="string" || !v.trim()) return "Not specified";
  // Keep the stored date's timezone semantics; never silently localize it.
  return v.includes("T") ? v.replace("T"," ").replace(/\.\d{3}Z$/," UTC") : v;
}
function label(v:unknown) {return value(v).replace(/_/g," ");}
export function reportPdfMetadata(record:Row,versioned:boolean) {
  const title=value(versioned?record.title_snapshot:record.title,"Untitled report");
  const type=label(versioned?record.product_type_snapshot:record.type);
  const status=label(versioned?record.version_status:record.status);
  const issued=versioned ? date(record.published_at) : "Not issued";
  const created=versioned ? date(record.created_at) : date(record.updated_at);
  return { title,type,status,issued,created,
    version:versioned?value(record.version_number):null,
    author:versioned ? value(record.created_by) : null,
    draft:!versioned || !record.published_at,
  };
}

function SectionHeading({number,title,styles}:{number:string;title:string;styles:ReturnType<typeof createBrandedPdfStyles>}){
  return <View style={styles.section} minPresenceAhead={95}>
    <Text style={styles.sectionKicker}>{number} / INTELLIGENCE PRODUCT</Text>
    <Text style={styles.sectionTitle}>{title}</Text>
    <View style={styles.sectionRule}/>
  </View>;
}

export function BrandedReportPdf({record,content,versioned,appearance="original"}:{record:Row;content:ReportDoc;versioned:boolean;appearance?:ReportPdfAppearance}){
  ensureCitemReportFonts();
  const s=createBrandedPdfStyles(reportPdfColors(appearance),appearance);
  const meta=reportPdfMetadata(record,versioned);
  const refs=versioned && Array.isArray(record.report_version_references)
    ? record.report_version_references.filter((x):x is Row=>x!==null && typeof x==="object" && !Array.isArray(x))
    : [];
  return <Document
    title={meta.title} subject={meta.type} creator="CİTEM Report Export" producer="CİTEM / BAYKUSH">
    <Page size="A4" style={s.cover}>
      <View style={s.coverAccent}/>
      <Text style={s.coverBrand}>CİTEM</Text>
      <Text style={s.coverBrandSub}>BAYKUSH / CYBER THREAT INTELLIGENCE</Text>
      <View style={s.coverRule}/>
      <Text style={s.coverKicker}>ANALYTICAL REPORT</Text>
      <Text style={[s.coverTitle,{fontSize:meta.title.length>130?23:meta.title.length>78?27:33}]}>{meta.title}</Text>
      <Text style={s.coverType}>{meta.type}</Text>
      <View style={s.coverDivider}>
        <View style={s.coverGrid}>
          <View style={{width:"52%"}}>
            <Text style={s.coverMetaLabel}>DOCUMENT STATUS</Text>
            <Text style={s.coverMetaValue}>{meta.status}</Text>
          </View>
          <View style={{width:"43%"}}>
            <Text style={s.coverMetaLabel}>{meta.version?"VERSION":"LAST UPDATED"}</Text>
            <Text style={s.coverMetaValue}>{meta.version??meta.created}</Text>
          </View>
        </View>
        <View style={[s.coverGrid,{marginTop:20}]}>
          <View style={{width:"52%"}}>
            <Text style={s.coverMetaLabel}>DATE</Text>
            <Text style={s.coverMetaValue}>{meta.created}</Text>
          </View>
          <View style={{width:"43%"}}>
            <Text style={s.coverMetaLabel}>ISSUED</Text>
            <Text style={s.coverMetaValue}>{meta.issued}</Text>
          </View>
        </View>
      </View>
      {meta.draft ? <Text style={s.coverWarning}>WORKING / UNPUBLISHED COPY — This export does not imply formal publication or endorsement.</Text>:null}
      <Text style={s.coverFoot}>CİTEM · BAYKUSH / INTELLIGENCE REPORTING</Text>
    </Page>
    <Page size="A4" style={s.body} wrap>
      <View fixed style={s.runningHeader}>
        <Text style={s.runningBrand}>CİTEM</Text>
        <Text style={s.runningType}>{meta.type}  /  {meta.status}</Text>
      </View>
      <View fixed style={s.runningFooter}>
        <Text style={s.footerLabel}>BAYKUSH / CİTEM · {meta.title.slice(0,48)}</Text>
      </View>
      <Text fixed style={s.footerNo} render={({pageNumber,totalPages})=>
        `PAGE ${pageNumber} / ${totalPages}`}/>
      <SectionHeading styles={s} number="00" title="Document information"/>
      <View style={s.metaBox}>
        <View style={s.metaRow}><Text style={s.metaKey}>Product type</Text><Text style={s.metaValue}>{meta.type}</Text></View>
        <View style={s.metaRow}><Text style={s.metaKey}>Status</Text><Text style={s.metaValue}>{meta.status}</Text></View>
        {meta.version ? <View style={s.metaRow}><Text style={s.metaKey}>Version</Text><Text style={s.metaValue}>{meta.version}</Text></View>:null}
        <View style={s.metaRow}><Text style={s.metaKey}>Record date</Text><Text style={s.metaValue}>{meta.created}</Text></View>
        {versioned ? <View style={s.metaRow}><Text style={s.metaKey}>Issued</Text><Text style={s.metaValue}>{meta.issued}</Text></View>:null}
        {meta.author ? <View style={s.metaRow}><Text style={s.metaKey}>Analyst record ID</Text><Text style={s.metaValue}>{meta.author}</Text></View>:null}
      </View>
      {versioned ? <>
        <SectionHeading styles={s} number="01" title="Analytical assessment"/>
        {REPORT_PDF_SECTIONS.map(([heading,key])=><View key={key} style={s.assessment}>
          <Text style={s.assessmentLabel}>{heading}</Text>
          <Text style={s.assessmentValue}>{value(record[key])}</Text>
        </View>)}
      </>:null}
      <SectionHeading styles={s} number={versioned?"02":"01"} title={versioned?"Frozen report content":"Report content"}/>
      <View style={{marginBottom:20}}>{tiptapToPdfElements(content,appearance)}</View>
      {versioned ? <>
        <SectionHeading styles={s} number="03" title="Referenced-record appendix"/>
        {refs.length ? refs.map((r,index)=><View key={index} style={s.reference}>
          <Text style={s.referenceType}>{label(r.reference_type)}</Text>
          <Text style={s.referenceTitle}>{value(r.label_snapshot)}</Text>
          <Text style={s.referenceMeta}>Source updated: {date(r.source_updated_at)}</Text>
          <Text style={s.referenceMeta}>Frozen state: {value(r.state_snapshot)}</Text>
        </View>):<Text style={s.empty}>No references included in this version.</Text>}
        {record.product_type_snapshot==="ATTRIBUTION_ASSESSMENT" ? <>
          <SectionHeading styles={s} number="04" title="Attribution disclaimer"/>
          <Text style={s.disclaimer}>{attributionDisclaimer}</Text>
        </>:null}
      </>:null}
    </Page>
  </Document>;
}
