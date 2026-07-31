import "server-only";
import type { IocProviderAdapter } from "./types";
import { syntheticProvider } from "./synthetic-provider";
export function providerRegistry(env: NodeJS.ProcessEnv = process.env): ReadonlyMap<string, IocProviderAdapter> {
  const adapters: IocProviderAdapter[] = [];
  if (env.IOC_TEST_PROVIDER_ENABLED === "true") adapters.push(syntheticProvider);
  return new Map(adapters.map(adapter => [adapter.key, adapter]));
}
export function getProvider(key: string) { return providerRegistry().get(key) ?? null; }
