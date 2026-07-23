# BYOK Cloud AI

BYOK means Bring Your Own Key. Cyber Research OS does not provide or pay for cloud LLM API keys. The server receives the key once over HTTPS for an explicit connection test, encrypts it into a short-lived HttpOnly SameSite=Strict cookie scoped to `/api` using Node `crypto` AES-256-GCM, then discards plaintext except immediately before provider requests. This is not end-to-end encryption.

Generate `BYOK_COOKIE_ENCRYPTION_KEY` with:

```bash
openssl rand -base64 32
```

Rotating this key invalidates existing BYOK sessions. `GUEST_SESSION_HMAC_KEY` can be generated the same way and is used to HMAC guest tokens/IPs; raw values are not stored. `SUPABASE_SERVICE_ROLE_KEY` is a powerful server-only secret used only for metadata-only guest sessions, usage events, and cleanup.

Supported fixed providers are the SSRF boundary: OpenAI `https://api.openai.com/v1` (`/models`, `/chat/completions`), OpenRouter `https://openrouter.ai/api/v1` (`/models`, `/chat/completions`), Groq `https://api.groq.com/openai/v1` (`/models`, `/chat/completions`), and NVIDIA NIM `https://integrate.api.nvidia.com/v1` (`/chat/completions`). Provider base URLs, headers, tools, web search, code execution, custom OpenAI-compatible URLs, and MCP servers are never accepted from clients.

Cloud provider model IDs must be explicit, bounded, and match conservative characters. Connection tests may make a minimal chat-completions request and may consume a tiny amount of provider quota. There is no silent fallback between Local Ollama and BYOK.

Guest users can run fixed preview-only workflows with pasted text: Summarize Research, Extract Indicators, Extract Entities, Suggest MITRE Mapping, Generate Report Draft, and Translate Document. Authenticated users can explicitly select BYOK in the project AI workspace and still use existing protected approval routes. Prompts, outputs, API keys, storage paths, signed URLs, and file bytes are not stored in usage metadata.

Turnstile uses `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and server-only `TURNSTILE_SECRET_KEY`. Production fails closed without verification. Development can use the literal `CIP_DEV_TURNSTILE_BYPASS`; production rejects that bypass.

Run `npm run guest:cleanup -- --no-dry-run` from a trusted server environment to delete expired guest sessions and cascade guest usage metadata. Without `--no-dry-run`, it reports a safe summary only.


## Shared connection UI

The same BYOK connection panel is used on `/demo/ai` and in the authenticated Project AI Workspace. Users can view enabled/connected/expired state, choose OpenAI/OpenRouter/Groq, enter a key only for Test and Connect, see structured provider errors, see expiration, disconnect the HttpOnly credential cookie, and explicitly choose Local Ollama or BYOK for generation.


## NVIDIA NIM

NVIDIA NIM is available as a fourth fixed BYOK provider using the official hosted NVIDIA Build endpoint `https://integrate.api.nvidia.com/v1/chat/completions`. Cyber Research OS does not provide NVIDIA API keys or pay for NVIDIA usage; visitors and authenticated users must supply their own NVIDIA key temporarily. The NVIDIA model selector is bounded to documented text/chat model IDs, including `nvidia/nemotron-3-super-120b-a12b` while it is listed in the official NVIDIA Build catalog. NVIDIA hosted/free catalog endpoints may have access, quota, latency, or availability limits controlled by NVIDIA. The NVIDIA request adapter omits `response_format` because the documented NIM chat-completions compatibility does not guarantee that parameter across catalog models. For allowlisted NVIDIA Nemotron models, requests include `chat_template_kwargs: { enable_thinking: false }` so default reasoning does not consume the bounded JSON output budget; server-side Zod parsing and the single repair/fail-closed workflow behavior remain enforced.


## Cookie route scope

The encrypted BYOK cookie is scoped to `Path=/api`, not `/` and not the legacy `/api/ai` path. This is required because status/connect/disconnect live under `/api/ai/byok`, authenticated generation lives under `/api/projects/[id]/ai/generate`, and guest generation lives under `/api/demo/ai/generate`. The cookie remains HttpOnly, SameSite=Strict, Secure in production, encrypted with AES-256-GCM, inaccessible to browser JavaScript, and decrypted only inside authorized AI server routes after user or guest binding checks. Reconnect clears the legacy `/api/ai` cookie before setting the current `/api` cookie; disconnect clears both paths.

## Defanged IOC normalization

Extract Indicators keeps the model-observed value for analyst context and separately computes a canonical value for validation, duplicate checks, and optional approval. Conservative Phase 7 normalization supports common defanged domain/URL forms such as `[.]`, `hxxp://`, and `hxxps://`; it is deterministic and idempotent, does not extract from unrelated prose, and fails closed for malformed candidates. When observed and normalized values differ, the review UI shows both. No AI result is persisted unless an authenticated analyst explicitly approves the canonical indicator.
