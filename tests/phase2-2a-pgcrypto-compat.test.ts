import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration=readFileSync("supabase/migrations/202607310024_phase2_2a_pgcrypto_compat.sql","utf8");

describe("Phase 2.2A pgcrypto compatibility migration",()=>{
 it("requires pgcrypto in the extensions schema",()=>{expect(migration).toContain("create extension if not exists pgcrypto with schema extensions");expect(migration).toContain("pgcrypto_must_be_installed_in_extensions_schema");});
 it("provides a strict immutable parallel-safe invoker wrapper",()=>{expect(migration).toMatch(/create or replace function public\.digest\(data text, algorithm text\)[\s\S]*immutable[\s\S]*strict[\s\S]*parallel safe[\s\S]*security invoker[\s\S]*set search_path = ''/);expect(migration).toContain("extensions.digest(data, algorithm)");});
 it("restricts execution to service_role",()=>{expect(migration).toContain("revoke all on function public.digest(text, text) from public, anon, authenticated");expect(migration).toContain("grant usage on schema extensions to service_role");expect(migration).toContain("grant execute on function extensions.digest(text, text) to service_role");expect(migration).toContain("grant execute on function public.digest(text, text) to service_role");});
});
