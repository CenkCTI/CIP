import Link from "next/link";
import type { ComponentProps } from "react";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { IocInbox, type IocCandidateRow, type IocConnection, type IocSourceRow } from "@/components/osint/ioc-inbox";
import { OsintWorkspace } from "@/components/osint/osint-workspace";
import { decodeIocCursor, encodeIocCursor, inboxQuery, iocInboxSchema } from "@/lib/ioc-connectors/schema";
import { decodeCursor, encodeCursor, filterSchema } from "@/lib/osint/schema";

type OsintWorkspaceProps = ComponentProps<typeof OsintWorkspace>;

export default async function OsintPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const raw = await searchParams;
  const view = raw.view === "iocs" ? "iocs" : "feed";
  const { user, supabase } = await requireUser();
  const nav = <nav className="mx-auto mb-5 flex max-w-6xl gap-2" aria-label="Intelligence workspace view"><Link className={`button ${view === "feed" ? "border-cyan-400" : ""}`} href="/osint?view=feed">Intelligence Feed</Link><Link className={`button ${view === "iocs" ? "border-cyan-400" : ""}`} href="/osint?view=iocs">IOC Inbox</Link></nav>;

  if (view === "iocs") {
    const parsed = iocInboxSchema.safeParse({ ...raw, view: "iocs" });
    if (!parsed.success) notFound();
    const filters = parsed.data;
    const cursor = decodeIocCursor(filters.ioc_cursor);
    if (filters.ioc_cursor && (!cursor || cursor.sort !== filters.ioc_sort)) notFound();
    const [{ data: rows, error }, { data: projects }, { data: connections }, { data: runs }, {data:otxSettings}] = await Promise.all([
      supabase.rpc("list_ioc_inbox_v2", { p_status: filters.ioc_status || null, p_type: filters.ioc_type || null, p_provider: filters.ioc_provider || null, p_search: filters.ioc_q || null, p_min_confidence: filters.ioc_min_confidence === "" ? null : filters.ioc_min_confidence, p_max_confidence: filters.ioc_max_confidence === "" ? null : filters.ioc_max_confidence, p_has_port: filters.ioc_port === "" ? null : filters.ioc_port === "present", p_project_id: filters.ioc_project || null, p_sort: filters.ioc_sort, p_cursor_value: cursor ? String(cursor.value) : null, p_cursor_id: cursor?.id ?? null, p_limit: 30 }),
      supabase.from("projects").select("id,name").eq("owner_id", user.id).order("name").limit(100),
      supabase.from("ioc_provider_connections").select("id,provider_key,display_name,enabled,scheduler_enabled,sync_interval_minutes,next_scheduled_sync_at,health_status,last_checked_at,last_success_at,last_error_message,archived_at").order("display_name").limit(100),
      supabase.from("ioc_ingestion_runs").select("id,provider_connection_id,status,trigger_type,started_at,completed_at,candidate_count,source_observation_count,created_count,updated_count,skipped_count,deduplicated_count,error_message").order("started_at", { ascending: false }).limit(20),
      supabase.from("otx_connection_settings").select("provider_connection_id,bootstrap_lookback_days").eq("owner_id",user.id).limit(100),
    ]);
    const typedRows = (rows ?? []) as IocCandidateRow[];
    const detailEntries = await Promise.all(typedRows.map(async row => {
      const { data } = await supabase.rpc("list_ioc_candidate_sources", { p_candidate_id: row.id, p_limit: 100 });
      return [row.id, (data ?? []) as IocSourceRow[]] as const;
    }));
    const last = typedRows.at(-1);
    const nextCursor = typedRows.length === 30 && last ? encodeIocCursor({ sort: filters.ioc_sort, value: Number(last.sort_value), id: last.id }) : null;
    const lookbacks=new Map((otxSettings??[]).map(setting=>[setting.provider_connection_id,setting.bootstrap_lookback_days]));
    const configuredConnections=(connections??[]).map(connection=>({...connection,bootstrap_lookback_days:lookbacks.get(connection.id)})) as IocConnection[];
    return <>{nav}{error ? <main className="card mx-auto max-w-6xl" role="alert">IOC Inbox could not be loaded.</main> : <main className="mx-auto max-w-6xl"><IocInbox rows={typedRows} projects={projects ?? []} connections={configuredConnections} runs={runs ?? []} sources={Object.fromEntries(detailEntries)} filters={filters} nextHref={nextCursor ? inboxQuery(filters, nextCursor) : null} syntheticEnabled={process.env.IOC_TEST_PROVIDER_ENABLED === "true"} /></main>}</>;
  }

  const parsed = filterSchema.safeParse(raw); if (!parsed.success) notFound();
  const filters = parsed.data, cursor = decodeCursor(filters.cursor); if (filters.cursor && !cursor) notFound();
  const [{ data: items, error }, { data: feeds }, { data: projects }] = await Promise.all([supabase.rpc("list_osint_feed", { p_mode: filters.mode, p_source_id: filters.source || null, p_from: filters.from || null, p_to: filters.to || null, p_search: filters.q || null, p_cursor_at: cursor?.timestamp ?? null, p_cursor_id: cursor?.id ?? null, p_limit: 30 }), supabase.from("research_feed_sources").select("id,name,description,enabled,scheduler_enabled,fetch_interval_minutes,next_scheduled_fetch_at,detected_feed_type,health_status,last_checked_at,last_success_at,last_error_message,archived_at").order("name").limit(100), supabase.from("projects").select("id,name").order("name").limit(100)]);
  if (error) throw new Error("Unable to load OSINT feed.");
  const itemRows = (items ?? []) as OsintWorkspaceProps["initialItems"], last = itemRows.at(-1), next = itemRows.length === 30 && last ? encodeCursor(String(last.effective_at), String(last.id)) : null;
  return <>{nav}<OsintWorkspace initialItems={itemRows} feeds={(feeds ?? []) as OsintWorkspaceProps["feeds"]} projects={(projects ?? []) as OsintWorkspaceProps["projects"]} filters={filters} nextCursor={next} /></>;
}
