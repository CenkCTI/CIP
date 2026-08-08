import "server-only";

import { cisaKevAdapter } from "./providers/cisa-kev";
import { firstEpssAdapter } from "./providers/first-epss";
import { malwareBazaarAdapter } from "./providers/malwarebazaar";
import { nvdCveAdapter } from "./providers/nvd-cve";
import { testSyntheticAdapter } from "./providers/test-synthetic";
import { threatFoxTechnicalAdapter } from "./providers/threatfox";
import { CollectionError } from "./errors";
import type { TechnicalSourceAdapter, TechnicalSourceKey } from "./types";

const nvdAdapter: TechnicalSourceAdapter = {
  ...nvdCveAdapter,
  metadata: {
    ...nvdCveAdapter.metadata,
    settingsFields: [
      {
        name: "initialLookbackHours",
        label: "Initial lookback hours",
        type: "integer",
        minimum: 1,
        maximum: 168,
        defaultValue: 24,
      },
    ],
  },
};

const adapters: Record<TechnicalSourceKey, TechnicalSourceAdapter> = {
  TEST_SYNTHETIC: testSyntheticAdapter,
  CISA_KEV: cisaKevAdapter,
  NVD_CVE: nvdAdapter,
  FIRST_EPSS: firstEpssAdapter,
  THREATFOX: threatFoxTechnicalAdapter,
  MALWAREBAZAAR: malwareBazaarAdapter,
};

export function isSyntheticSourceEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.TECHINT_TEST_SOURCE_ENABLED === "true";
}

export function listTechnicalSources(env: NodeJS.ProcessEnv = process.env) {
  return (Object.values(adapters) as TechnicalSourceAdapter[]).filter(
    (adapter) => !adapter.metadata.testSynthetic || isSyntheticSourceEnabled(env),
  );
}

export function getTechnicalSourceAdapter(key: TechnicalSourceKey, env: NodeJS.ProcessEnv = process.env) {
  const adapter = adapters[key];
  if (adapter.metadata.testSynthetic && !isSyntheticSourceEnabled(env)) {
    throw new CollectionError("SOURCE_NOT_AVAILABLE", "The requested Technical Source is not available in this environment.");
  }
  return adapter;
}
