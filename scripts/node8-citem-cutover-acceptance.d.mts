export interface CutoverResult { schemaVersion: string; evidenceClass: string; result: string; [key: string]: unknown }
export function run(mode?: "real" | "synthetic"): Promise<CutoverResult>;
