import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
export default defineConfig({ plugins:[react()], test:{ environment:"jsdom", globals:true, setupFiles:"./tests/setup.ts", exclude:["e2e/**","node_modules/**"] }, resolve:{ alias:{ "@":"/workspace/CIP/src", "server-only":"/workspace/CIP/tests/server-only.ts" } } });
