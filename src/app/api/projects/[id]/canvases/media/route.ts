import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnedProject } from "@/lib/projects/ownership";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};
const uuid = z.string().uuid();
const inputSchema = z.object({
  assetIds: z.array(uuid).min(1).max(30),
}).strict();
const maxPreviewBytes = 80 * 1024 * 1024;
const signedUrlSeconds = 300;

type PreviewKind = "PDF" | "IMAGE" | "UNSUPPORTED";
function classify(mime: string, size: number | null): PreviewKind {
  if (size !== null && (size < 0 || size > maxPreviewBytes)) return "UNSUPPORTED";
  if (mime === "application/pdf") return "PDF";
  if (["image/jpeg", "image/png", "image/webp"].includes(mime)) return "IMAGE";
  return "UNSUPPORTED";
}

/**
 * Only existing, READY, ORIGINAL source_assets from an Investigation the caller owns.
 * File bytes are never proxied, imported into the Canvas DB or read by the server.
 * Signed Storage URLs are minted only for the authenticated viewing session.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!uuid.safeParse(id).success) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers });
  }
  const ctx = await requireOwnedProject(id).catch(() => null);
  if (!ctx) return NextResponse.json({ error: "Not found" }, { status: 404, headers });

  const body = await req.text().catch(() => "");
  if (body.length > 5000) return NextResponse.json({ error: "Batch too large" }, { status: 413, headers });
  const input = inputSchema.safeParse((() => { try { return JSON.parse(body); } catch { return null; } })());
  if (!input.success) return NextResponse.json({ error: "Invalid asset references" }, { status: 400, headers });
  const ids = [...new Set(input.data.assetIds)];

  const { data, error } = await ctx.supabase.from("source_assets")
    .select("id,source_id,original_filename,mime_type,size_bytes,storage_path")
    .eq("project_id",id).eq("asset_role","ORIGINAL").eq("state","READY")
    .in("id",ids).limit(30);
  if (error) return NextResponse.json({ error: "Media lookup unavailable" }, { status: 503, headers });

  const items = await Promise.all((data ?? []).map(async (asset) => {
    const mime = String(asset.mime_type || "").toLowerCase().split(";")[0].trim();
    const byteCount = asset.size_bytes == null ? null : Number(asset.size_bytes);
    const kind = classify(mime, byteCount);
    const signed = kind === "UNSUPPORTED" || !asset.storage_path
      ? null
      : await ctx.supabase.storage.from("source-assets")
          .createSignedUrl(String(asset.storage_path), signedUrlSeconds);
    const url = signed?.data?.signedUrl ?? null;
    return {
      assetId: asset.id,
      sourceId: asset.source_id,
      fileName: String(asset.original_filename ?? "Source asset").replace(/\s+/g, " ").slice(0, 200),
      mimeType: mime.slice(0, 100),
      sizeBytes: Number.isSafeInteger(byteCount) ? byteCount : null,
      kind,
      signedUrl: url,
      expiresInSeconds: url ? signedUrlSeconds : 0,
      href: `/projects/${id}/sources/${asset.source_id}`,
    };
  }));
  const available = new Set(items.map((item) => item.assetId));
  return NextResponse.json({ items, missing: ids.filter((assetId) => !available.has(assetId)) },
    { headers });
}
