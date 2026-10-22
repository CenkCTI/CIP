# CİTEM — Intelligence Memory and opt-in Analyst Chat (initial implementation)

This **separate Draft PR** extends the Source Reader Copilot; it does not expand AI's authority to write threat intelligence, determine attribution, or make automatic analyst decisions.

## Scope implemented
- **Same chat composer:** opt into `Analyst chat · persistent investigation memory`; its `Ask analyst` button runs an independent analytical workflow instead of the restricted Stage 3 PDF extraction/analysis prompt.
- **Analytical latitude:** explanatory questions, causal hypotheses, threat-pattern reasoning, scenarios, and conditional forecasts. Up to three alternative hypotheses are structured by rationale, LOW/MEDIUM/HIGH *model judgement* (not calibrated probabilities), supporting considerations, counter-evidence and proposed discriminating tests.
- **Grounded vs inferred:** server verifies PDF and web excerpts against the actual original data; external URLs are server-resolved, never model-invented. Analysis and prior AI responses are labeled *not independently verified*. No AI-created intelligence-domain records.
- **Web search in chat:** a per-message opt-in sends ONLY the analyst's question to configured Brave Search. CİTEM reads up to two search result pages via its existing DNS-pinned, HTTPS-only, redirect-limited safe reader. Sources that fail to load are not treated as corroboration. WEB excerpts are quoted only when exact-quote verification succeeds; each displays actual URL and retrieval date.
- **Persistent chat memory:** owner/project/source/asset-bound profiles and turns in PostgreSQL. The visible transcript is tied to the current PDF; for analysis, up to six bounded relevant/recent exchanges may be retrieved across other PDFs of **the same owned investigation**, along with current-source analyst-edited notes. Conversation history is NOT evidence. Analyst can clear the current PDF's turns while retaining its notes.
- **Question-independent mode:** disable `Include selected PDF evidence` to ask broad conceptual questions without loading a PDF. For quick chat with source context enabled, the default Entire PDF selection is narrowed **explicitly** to the active page; an analyst-selected page/page-range/annotation remains respected.
- **No secrets or PDFs in browser persistence:** authenticated PostgREST RLS and server endpoints only; the NVIDIA BYOK cookie is not copied into memory or AI response. No vector database or uncontrolled autonomous web tool.

## Minimal in-chat Copilot UX (2026-10-22 revision)

- **Top-bar Settings:** BYOK connection, persistent Analyst chat, PDF evidence option, web-research mode availability, notes, and clear-history are located in one overlay. They no longer occupy separate scrollable areas. Analyst chat, PDF context and availability of web-research mode **start enabled**. BYOK API credentials remain controlled by the pre-existing encrypted session.
- **Chat as the primary surface:** no standalone Controlled Web Research dock and no persistent memory checkbox panel below the chat. The composer remains at the bottom; the Research mode is chosen from the actions alongside Analyse context. Legacy source-only Ask/Analyse/Extract still exist.
- **Research approval flow:** submitting a research question first asks NVIDIA to propose up to three search queries. Proposals appear as a conversation card; no web search is made at this stage. The analyst selects queries and explicitly clicks **Search selected** to send only those queries to Brave. The returned web results appear in the same chat history. The analyst then chooses up to two sources and clicks **Read & analyse selected**. Only the selected HTTPS links are fetched via the existing private-address/redirect-blocking reader.
- **Evidence and hypotheses:** the selected pages and conversation memory may be used for the NVIDIA assessment, but search snippets do not become evidence. PDF and web excerpts are verbatim-checked; independent hypotheses and predictions stay labeled provisional. The assessment also appears inline and its response is stored in the source-scoped conversation profile.
- **No implicit web queries:** an ordinary Ask Analyst never silently searches Brave, even though the Web Research feature is enabled by default. Choosing Research and approving queries/selected sources authorizes each external action. On failures, query suggestions remain editable/retryable in the conversation.
- **Current limits:** research-query suggestions and source cards are UI session data; saved analysis and its verified source references persist in memory. The old Controlled Web Research module is still present in the codebase but is not rendered inside the Copilot dialogue.

## Database migration and rollout
1. Apply **migration `202610220064_copilot_investigation_memory.sql`**, followed by **`202610220065_copilot_memory_acl_hardening.sql`**, on the intended environment after migration 063. Both migrations are required: Supabase's default table grants can include `anon`, so 065 explicitly revokes broad access and preserves owner-scoped authenticated RLS.
   - The connected `CIP` Supabase database had migrations 064 and 065 applied on 2026-10-22, with a rollback-only owner write/read smoke check and an access-control check. This does **not** imply other environments have been migrated. **Do not deploy the UI to other environments without both migrations.**
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
