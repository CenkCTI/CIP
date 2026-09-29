import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "node_modules", "pdfjs-dist");
const to = join(root, "public", "vendor", "pdfjs");

if (!existsSync(from)) {
  throw new Error("pdfjs-dist is not installed; PDF.js assets cannot be prepared.");
}

mkdirSync(to, { recursive: true });
cpSync(join(from, "build", "pdf.worker.min.mjs"), join(to, "pdf.worker.min.mjs"));
cpSync(join(from, "cmaps"), join(to, "cmaps"), { recursive: true });
cpSync(join(from, "standard_fonts"), join(to, "standard_fonts"), { recursive: true });

console.log("PDF.js worker, CMaps and standard fonts copied to public/vendor/pdfjs.");
