"use client";

import { useEffect, useState } from "react";
import {
  parseReportPdfAppearance,
  REPORT_PDF_APPEARANCES,
  REPORT_PDF_APPEARANCE_STORAGE_KEY,
  type ReportPdfAppearance,
} from "@/lib/reports/pdf-appearance";

/** Keeps each PDF export independently selectable; never changes draft data.
 * The selected appearance is encoded in the actual download URL.
 */
export function ReportPdfExportLink({
  href,label="Download PDF",disabled=false,compact=false,
}:{
  href:string;label?:string;disabled?:boolean;compact?:boolean;
}){
  const [appearance,setAppearance]=useState<ReportPdfAppearance>("original");
  useEffect(()=>{
    const frame=window.requestAnimationFrame(()=>{
      try{setAppearance(parseReportPdfAppearance(window.localStorage.getItem(REPORT_PDF_APPEARANCE_STORAGE_KEY)));}
      catch{setAppearance("original");}
    });
    return()=>window.cancelAnimationFrame(frame);
  },[]);
  const choose=(value:ReportPdfAppearance)=>{
    setAppearance(value);
    try{window.localStorage.setItem(REPORT_PDF_APPEARANCE_STORAGE_KEY,value);}catch{}
  };
  const downloadHref=`${href}${href.includes("?")?"&":"?"}appearance=${appearance}`;
  return <div className={compact?"flex flex-wrap items-center gap-2":"mt-3 flex flex-wrap items-end gap-2"}>
    <label className="flex flex-col gap-1 text-xs text-slate-400">
      PDF görünümü
      <select
        aria-label="Rapor PDF görünümü"
        className="rounded border border-slate-600 bg-[#151b1e] px-2 py-2 text-sm text-stone-100 focus-visible:outline-2 focus-visible:outline-amber-400"
        value={appearance}
        onChange={event=>choose(parseReportPdfAppearance(event.currentTarget.value))}
        disabled={disabled}
      >
        {REPORT_PDF_APPEARANCES.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
    <a
      className={`rounded border border-slate-700 px-3 py-2 text-sm ${disabled?"cursor-not-allowed opacity-50":"hover:border-amber-700"}`}
      href={disabled?undefined:downloadHref}
      aria-disabled={disabled}
      tabIndex={disabled?-1:undefined}
    >{disabled?"Saving before PDF":label}</a>
  </div>;
}
