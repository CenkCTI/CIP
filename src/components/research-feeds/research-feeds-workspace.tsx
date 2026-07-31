"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";

import {
  archiveResearchFeed,
  createResearchFeed,
  fetchResearchFeedNow,
  restoreResearchFeed,
  setResearchFeedEnabled,
  updateResearchFeed,
  type FeedActionState,
} from "@/app/projects/[id]/research-feed-actions";

type Feed = { id:string;name:string;description:string;display_url:string|null;enabled:boolean;archived_at:string|null;detected_feed_type:string;health_status:string;consecutive_failures:number;last_checked_at:string|null;last_success_at:string|null;last_error_message:string|null;recent_item_count:number };
type Run = { id:string;feed_source_id:string;status:string;http_status:number|null;items_seen:number;items_changed?:number;completed_at:string|null };
type Item = { id:string;feed_source_id:string;title:string|null;published_at:string|null;first_seen_at:string;last_seen_at:string;canonical_url:string|null };
type FeedOperation = "fetch" | "toggle" | "archive" | "restore";

type OperationResult = { success?: string; error?: string };

export function ResearchFeedsWorkspace({projectId,feeds,runs,items}:{projectId:string;feeds:Feed[];runs:Run[];items:Item[]}) {
  const router = useRouter();
  const [createState,createAction,createPending]=useActionState(createResearchFeed.bind(null,projectId),{} as FeedActionState);
  const [busyByFeed,setBusyByFeed]=useState<Record<string,FeedOperation|undefined>>({});
  const [feedbackByFeed,setFeedbackByFeed]=useState<Record<string,OperationResult|undefined>>({});
  const [editing,setEditing]=useState<string|null>(null);

  async function runFeedOperation(feedId:string,operation:FeedOperation,action:()=>Promise<OperationResult>) {
    setBusyByFeed(current=>({...current,[feedId]:operation}));
    setFeedbackByFeed(current=>({...current,[feedId]:undefined}));
    try {
      const result=await action();
      setFeedbackByFeed(current=>({...current,[feedId]:result.error?{error:result.error}:{success:result.success??"Feed action completed."}}));
    } catch {
      setFeedbackByFeed(current=>({...current,[feedId]:{error:"The feed action could not be completed safely."}}));
    } finally {
      setBusyByFeed(current=>({...current,[feedId]:undefined}));
      router.refresh();
    }
  }

  return <div className="mt-6 space-y-6"><header><h2 className="text-2xl font-semibold text-white">Research Feeds</h2><p className="text-sm text-slate-400">External collected material is untrusted and never becomes Evidence or an analytical Source automatically.</p></header>
    <form action={createAction} className="card grid gap-3 md:grid-cols-2"><input name="name" required maxLength={240} placeholder="Feed name"/><input name="configured_url" required maxLength={4096} placeholder="https://example.org/feed.xml"/><textarea name="description" maxLength={10000} placeholder="Description"/><label><input type="checkbox" name="enabled" defaultChecked/> Enabled</label><button disabled={createPending} className="button">{createPending?"Creating…":"Create feed"}</button>{(createState.error||createState.success)&&<p>{createState.error??createState.success}</p>}</form>
    <div className="space-y-4">{feeds.map(feed=>{
      const activeOperation=busyByFeed[feed.id];
      const feedBusy=Boolean(activeOperation);
      const feedback=feedbackByFeed[feed.id];
      return <article className="card" data-testid={`feed-card-${feed.id}`} key={feed.id}><div className="flex flex-wrap justify-between gap-3"><div><h3 className="font-semibold text-white">{feed.name}</h3><p className="text-sm text-slate-400">{feed.display_url}</p><p className="text-sm">{feed.archived_at?"Archived":feed.enabled?"Enabled":"Paused"} · {feed.detected_feed_type} · {feed.health_status} · failures {feed.consecutive_failures}</p><p className="text-xs text-slate-400">Checked {feed.last_checked_at??"never"}; successful {feed.last_success_at??"never"}; {feed.recent_item_count} items</p>{feed.last_error_message&&<p className="text-sm text-red-300">{feed.last_error_message}</p>}</div>
        <div className="flex gap-2">{feed.archived_at?<button type="button" className="button" disabled={feedBusy} onClick={()=>void runFeedOperation(feed.id,"restore",()=>restoreResearchFeed(projectId,feed.id))}>{activeOperation==="restore"?"Restoring…":"Restore"}</button>:<><button type="button" className="button" disabled={feedBusy||!feed.enabled} onClick={()=>void runFeedOperation(feed.id,"fetch",()=>fetchResearchFeedNow(projectId,feed.id))}>{activeOperation==="fetch"?"Fetching…":"Fetch now"}</button><button type="button" className="button" disabled={feedBusy} onClick={()=>void runFeedOperation(feed.id,"toggle",()=>setResearchFeedEnabled(projectId,feed.id,!feed.enabled))}>{activeOperation==="toggle"?"Saving…":feed.enabled?"Pause":"Enable"}</button><button type="button" className="button" disabled={feedBusy} onClick={()=>setEditing(editing===feed.id?null:feed.id)}>Edit</button><button type="button" className="button" disabled={feedBusy} onClick={()=>void runFeedOperation(feed.id,"archive",()=>archiveResearchFeed(projectId,feed.id))}>{activeOperation==="archive"?"Archiving…":"Archive"}</button></>}</div></div>
        {feedback?.success&&<p role="status" className="mt-3 text-sm text-emerald-300">{feedback.success}</p>}
        {feedback?.error&&feedback.error!==feed.last_error_message&&<p role="alert" className="mt-3 text-sm text-red-300">{feedback.error}</p>}
        {editing===feed.id&&!feed.archived_at&&<Edit projectId={projectId} feed={feed}/>}<details className="mt-3"><summary>Recent runs and normalized items</summary><ul>{runs.filter(run=>run.feed_source_id===feed.id).map(run=><li key={run.id}>{run.status} · {run.http_status??"—"} · {run.items_seen} seen · {run.items_changed??0} changed · {run.completed_at??"running"}</li>)}</ul><ul>{items.filter(item=>item.feed_source_id===feed.id).map(item=><li key={item.id}>{item.title??"Untitled"} · {item.published_at??"date unknown"} · first {item.first_seen_at} · last {item.last_seen_at}{item.canonical_url&&<> · <a rel="noreferrer" target="_blank" href={item.canonical_url}>Open item</a></>}</li>)}</ul></details></article>;
    })}</div></div>;
}

function Edit({projectId,feed}:{projectId:string;feed:Feed}) {
  const [state,action,pending]=useActionState(updateResearchFeed.bind(null,projectId,feed.id),{} as FeedActionState);
  return <form action={action} className="mt-3 grid gap-2"><input name="name" defaultValue={feed.name}/><input name="configured_url" placeholder="Leave blank to keep the current URL"/><textarea name="description" defaultValue={feed.description}/><label><input name="enabled" type="checkbox" defaultChecked={feed.enabled}/> Enabled</label><button className="button" disabled={pending}>Save</button>{(state.error||state.success)&&<p>{state.error??state.success}</p>}</form>;
}
