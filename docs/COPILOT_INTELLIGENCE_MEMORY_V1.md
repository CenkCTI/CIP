# CİTEM — Intelligence Memory and opt-in Analyst Chat (initial implementation)

This **separate Draft PR** extends the Source Reader Copilot; it does not expand AI's authority to write threat intelligence, determine attribution, or make automatic analyst decisions.

## Scope implemented
- **Same chat composer:** opt into `Analyst chat · persistent investigation memory`; its `Ask analyst` button runs an independent analytical workflow instead of the restricted Stage 3 PDF extraction/analysis prompt.
- **Analytical latitude:** explanatory questions, causal hypotheses, threat-pattern reasoning, scenarios, and conditional forecasts. Up to three alternative hypotheses are structured by rationale, LOW/MEDIUM/HIGH *model judgement* (not calibrated probabilities), supporting considerations, counter-evidence and proposed discriminating tests.
- **Grounded vs inferred:** server verifies PDF and web excerpts against the actual original data; external URLs are server-resolved, never model-invented. Analysis and prior AI responses are labeled *not independently verified*. No AI-created intelligence-domain records.
- **Web search in chat:** a per-message opt-in sends ONLY the analyst's question to configured Brave Search. CİTEM reads up to two search result pages via its existing DNS-pinned, HTTPS-only, redirect-limited safe reader. Sources that fail to load are not treated as corroboration. WEB excerpts are quoted only when exact-quote verification succeeds; each displays actual URL and retrieval date.
- **Persistent chat memory:** user/project/source/asset-bound profiles and turns in PostgreSQL. Load saved questions and answers on entering Analyst chat; six bounded relevant/recent exchanges plus optional analyst-edited notes can inform the next answer. Conversation history is NOT evidence. Analyst can clear turns while retaining notes.
- **Question-independent mode:** disable `Include selected PDF evidence` to ask broad conceptual questions without loading a PDF. For quick chat with source context enabled, the default Entire PDF selection is narrowed **explicitly** to the active page; an analyst-selected page/page-range/annotation remains respected.
- **No secrets or PDFs in browser persistence:** authenticated PostgREST RLS and server endpoints only; the NVIDIA BYOK cookie is not copied into memory or AI response. No vector database or uncontrolled autonomous web tool.

## Database migration and rollout
1. Apply **migration `202610220064_copilot_investigation_memory.sql`** on the intended environment, after existing migration 063. **Do not deploy the UI without the migration.**
2. Ensure the preexisting `BRAVE_SEARCH_API_KEY` server setting is configured for optional web searches.
3. Check project-owner separation, source/asset mismatch, cross-user data denial, deletion and data retention. Confirm the `source-assets` immutable original remains unchanged.
4. Validate Turkish and English hypothesis reasoning with real BYOK models and source-grounded PDF documents; ensure unsupported source tokens and fabricated quotations are rejected.
5. Test default legacy Ask, Analyse, Extract Candidates, Phase 4 whole-document scan, Stage 5/6 Controlled Web Research; ensure no regressions.

## Not part of this initial PR
- Automatic indexed TXT/JSON conversion of **every PDF at upload time**. The existing PDF.js source context preparation still reads the original PDF, and very large PDF requests may require smaller page scopes. A separate ingestion/indexing job and versioned page cache are needed to eliminate repeated parsing across sessions.
- Vector semantic retrieval across all project sources, autonomous multi-hop web investigation, calibrated probabilistic forecasts, reusable research plans and background monitoring.
- Production PostgreSQL integration or real-document acceptance until manually executed. CI tests alone do not verify deployment migrations or live provider behavior.

## Security principles
- External web search requires explicit opt-in and never sends PDF text, notes, past chat, tokens, or source IDs to search provider.
- Website content, PDF text, analyst-entered notes and conversational memory remain untrusted as instructions. No tools granted to NVIDIA.
- No source verification, attribution or predictive confidence claims from model-only reasoning. Owner-project RLS enforced on both new tables.
- Stored prompts/answers are potentially sensitive: chat memory persists until analyst clears it or associated source/project is deleted. Review retention policy before production.
