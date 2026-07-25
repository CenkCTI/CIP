import { readFileSync } from "node:fs";
import { join } from "node:path";

export const runtime = "nodejs";

const EMBEDDED_IMAGE_PATTERN = /data:image\/webp;base64,([^\"]+)/;

export async function GET() {
  const source = readFileSync(
    join(process.cwd(), "public", "brand", "citem-owl-mark.svg"),
    "utf8",
  );
  const match = EMBEDDED_IMAGE_PATTERN.exec(source);

  if (!match?.[1]) {
    return new Response("CİTEM logo asset is unavailable.", { status: 404 });
  }

  const body = Buffer.from(match[1], "base64");

  return new Response(body, {
    headers: {
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Length": String(body.byteLength),
      "Content-Type": "image/webp",
    },
  });
}
