import "server-only";import type {IocProviderAdapter} from "./types";import {syntheticProvider} from "./synthetic-provider";
export function providerRegistry(env:NodeJS.ProcessEnv=process.env):ReadonlyMap<string,IocProviderAdapter>{const entries:IocProviderAdapter[]=[];if(env.IOC_TEST_PROVIDER_ENABLED==="true")entries.push(syntheticProvider);return new Map(entries.map(x=>[x.key,x]))}
export function getProvider(key:string){return providerRegistry().get(key)??null}
