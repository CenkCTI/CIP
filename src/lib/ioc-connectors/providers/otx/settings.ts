import {z} from "zod";
export const OTX_BOOTSTRAP_LOOKBACK_DAYS=[1,3,7,14,30,90,180,365] as const;
export type OtxBootstrapLookbackDays=(typeof OTX_BOOTSTRAP_LOOKBACK_DAYS)[number];
export const OTX_DEFAULT_BOOTSTRAP_LOOKBACK_DAYS:OtxBootstrapLookbackDays=7;
export const otxBootstrapLookbackSchema=z.coerce.number().int().refine((value):value is OtxBootstrapLookbackDays=>OTX_BOOTSTRAP_LOOKBACK_DAYS.includes(value as OtxBootstrapLookbackDays),"Unsupported OTX bootstrap look-back.");
