import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { reportDraftAutosaveSchema } from "@/lib/workspace-v2/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; reportId: string }> },
) {
  try {
    const { id, reportId } = await params;
    const parsed = reportDraftAutosaveSchema.safeParse(await req.json());
    if (!parsed.success)
      return NextResponse.json({ error: "Invalid report draft." }, { status: 400 });

    const { supabase, user } = await requireUser();
    const { data: project } = await supabase
      .from("projects")
      .select("id,owner_id")
      .eq("id", id)
      .single();
    if (!project || project.owner_id !== user.id)
      return NextResponse.json({ error: "Report not found." }, { status: 404 });

    const nextRevision = parsed.data.baseRevision + 1;
    const { data, error } = await supabase
      .from("reports")
      .update({
        title: parsed.data.title,
        type: parsed.data.type,
        status: parsed.data.status,
        content: parsed.data.content,
        draft_revision: nextRevision,
      })
      .eq("project_id", id)
      .eq("id", reportId)
      .eq("author_id", user.id)
      .eq("draft_revision", parsed.data.baseRevision)
      .select("draft_revision,updated_at")
      .maybeSingle();

    if (error)
      return NextResponse.json({ error: "Report draft could not be saved." }, { status: 400 });
    if (!data)
      return NextResponse.json(
        { error: "This report changed elsewhere. Reload it before continuing.", code: "EDIT_CONFLICT" },
        { status: 409 },
      );

    revalidatePath(`/projects/${id}`);
    revalidatePath(`/projects/${id}/reports/${reportId}`);
    return NextResponse.json({
      ok: true,
      revision: data.draft_revision,
      savedAt: data.updated_at,
    });
  } catch {
    return NextResponse.json({ error: "Report draft could not be saved." }, { status: 400 });
  }
}
