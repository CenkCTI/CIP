import "server-only";
import type { IocProviderAdapter } from "./types";
import { syntheticProvider } from "./synthetic-provider";
import { threatFoxAdapter } from "./providers/threatfox/adapter";
import { otxAdapter } from "./providers/otx/adapter";
export function providerRegistry(env: NodeJS.ProcessEnv = process.env): ReadonlyMap<string, IocProviderAdapter> {
  const adapters: IocProviderAdapter[] = [threatFoxAdapter,otxAdapter];
  if (env.IOC_TEST_PROVIDER_ENABLED === "true") adapters.push(syntheticProvider);
  return new Map(adapters.map(adapter => [adapter.key, adapter]));
}
export function getProvider(key: string) { return providerRegistry().get(key) ?? null; }
