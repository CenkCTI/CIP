import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the Node-only PDF parser and its native DOMMatrix/canvas polyfills
  // outside the Next.js server bundler. Browser PDF viewing is unaffected.
  serverExternalPackages: ["pdfjs-dist", "@napi-rs/canvas"],
  outputFileTracingIncludes: {
    // Embed the same Turkish-capable Liberation Sans fonts in server-rendered reports.
    "/api/projects/*/reports/*/export/*": [
      "./node_modules/pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf",
      "./node_modules/pdfjs-dist/standard_fonts/LiberationSans-Bold.ttf",
    ],
    // Use a wildcard for the dynamic [id] segment. Picomatch treats bare
    // brackets as a character class, so an unescaped literal "[id]" fails
    // to match the route key and Next.js silently omits traced native files.
    "/api/projects/*/ai/processing": [
      "./node_modules/pdfjs-dist/legacy/build/**/*",
      "./node_modules/pdfjs-dist/standard_fonts/**/*",
      "./node_modules/pdfjs-dist/cmaps/**/*",
      "./node_modules/pdfjs-dist/wasm/**/*",
      "./node_modules/@napi-rs/canvas/**/*",
      "./node_modules/@napi-rs/canvas-linux-x64-gnu/**/*",
      "./node_modules/@napi-rs/canvas-linux-arm64-gnu/**/*",
      "./node_modules/@napi-rs/canvas-linux-x64-musl/**/*",
      "./node_modules/@napi-rs/canvas-linux-arm64-musl/**/*",
    ],
  },
};

export default nextConfig;
