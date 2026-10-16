import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the Node-only PDF parser and its native DOMMatrix/canvas polyfills
  // outside the Next.js server bundler. Browser PDF viewing is unaffected.
  serverExternalPackages: ["pdfjs-dist", "@napi-rs/canvas"],
  outputFileTracingIncludes: {
    // Explicitly target the nested App Router endpoint. The previous
    // "/api/projects/*" pattern did not reliably cover this route.
    "/api/projects/[id]/ai/processing": [
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
