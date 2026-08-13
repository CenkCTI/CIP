import "server-only";
import { z } from "zod";

const schema=z.object({BAYKUSH_NODE_BASE_URL:z.url().refine(value=>process.env.NODE_ENV!=='production'||value.startsWith('https://'),'Node API must use HTTPS in production'),BAYKUSH_NODE_API_TOKEN:z.string().min(32),BAYKUSH_NODE_TIMEOUT_MS:z.coerce.number().int().min(1000).max(30000).default(9000)});
export function nodeConfig(env:NodeJS.ProcessEnv=process.env){const parsed=schema.safeParse(env);if(!parsed.success)throw new Error('BAYKUSH_NODE_NOT_CONFIGURED');return{baseUrl:parsed.data.BAYKUSH_NODE_BASE_URL.replace(/\/$/,''),token:parsed.data.BAYKUSH_NODE_API_TOKEN,timeoutMs:parsed.data.BAYKUSH_NODE_TIMEOUT_MS};}
