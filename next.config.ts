import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/projects/*": [
      "./node_modules/pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf",
      "./node_modules/pdfjs-dist/standard_fonts/LiberationSans-Bold.ttf",
    ],
  },
};

export default nextConfig;
