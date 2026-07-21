const enabled = process.env.AI_ENABLED === 'true';
if (!enabled || process.env.AI_PROVIDER !== 'ollama' || !process.env.AI_MODEL) {
  console.log('AI smoke skipped: set AI_ENABLED=true, AI_PROVIDER=ollama, and AI_MODEL to an installed Ollama model.');
  process.exit(0);
}
const base = process.env.AI_BASE_URL || 'http://127.0.0.1:11434/v1';
const ctrl = new AbortController();
setTimeout(() => ctrl.abort(), Number(process.env.AI_REQUEST_TIMEOUT_MS || 120000));
try {
  const res = await fetch(`${base.replace(/\/$/,'')}/chat/completions`, { method:'POST', headers:{'content-type':'application/json', ...(process.env.AI_API_KEY ? {authorization:`Bearer ${process.env.AI_API_KEY}`} : {})}, body: JSON.stringify({model: process.env.AI_MODEL, messages:[{role:'user', content:'Return {"ok":true} as JSON only.'}], stream:false, max_tokens:32}), signal: ctrl.signal });
  console.log(res.ok ? 'AI smoke passed: provider returned a response.' : `AI smoke failed: provider returned HTTP ${res.status}.`);
  process.exit(res.ok ? 0 : 1);
} catch { console.log('AI smoke failed: provider unreachable or timed out.'); process.exit(1); }
