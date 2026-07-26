const EMBEDDED_IMAGE_PATTERN = /data:image\/webp;base64,([^\"]+)/;

export async function GET(request: Request) {
  const assetUrl = new URL("/brand/citem-owl-mark.svg", request.url);
  const assetResponse = await fetch(assetUrl, {
    cache: "force-cache",
    redirect: "error",
  });

  if (!assetResponse.ok) {
    return new Response(null, { status: 404 });
  }

  const contentType = assetResponse.headers.get("content-type") ?? "";
  if (!contentType.includes("image/svg+xml")) {
    return new Response(null, { status: 404 });
  }

  const source = await assetResponse.text();
  const match = EMBEDDED_IMAGE_PATTERN.exec(source);
  if (!match?.[1]) {
    return new Response(null, { status: 404 });
  }

  const body = Buffer.from(match[1], "base64");

  return new Response(body, {
    headers: {
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Length": String(body.byteLength),
      "Content-Type": "image/webp",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
