# CİTEM Unified Investigation Memory and Source-Verified RAG

Status: implementation PR, pending PostgreSQL CI, browser acceptance and live migration 066. This branch builds on merged PR #80.

## User scenario

1. Upload an original ANSSI PDF. CİTEM finalizes it in the existing private Source Collection.
2. The upload UI invokes authenticated PDF indexing; the server rereads the owned original, checks its SHA-256 fingerprint and saves exact page-addressable text snippets. PDF and private Storage URL are never sent to the model during indexing.
3. Entire PDF Analyse produces verified excerpts. Successful Stage 3 analyses and candidate-extraction summaries are added as NON-authoritative events in a project-level investigation timeline.
4. The analyst asks about strategic purpose while looking at page 1. Analyst Chat retrieves prior provisional analysis summaries, campaign identifiers, and relevant exact excerpts from any already indexed PDF in that same owned investigation.
5. NVIDIA receives a bounded selection of indexed snippets and explicitly untrusted historical context. CİTEM verifies every claimed PDF quote against the saved source snippet. Hypotheses remain provisional, not saved as approved intelligence claims.
6. Reloading the browser preserves prior conversation turns and investigation events. Source IDs and page numbers remain tied to the original document and cannot silently navigate another PDF.

## Exact data flow and security

Database migration 066 adds copilot_document_indexes, copilot_document_chunks, copilot_investigation_events and an invoker-only owner-scoped keyword-search RPC. The owner ID, investigation ID, original asset/source identity, status and original SHA-256 are checked before search results can be returned. The search function has a 20-result upper bound and per-asset diversity limit. PostgreSQL RLS protects authenticated reads on all three tables; only the server-side admin workflow may write original-derived PDF chunks or generated analysis events, after verifying project/source ownership. Direct authenticated writes and anonymous privileges are revoked, as is anonymous search RPC access.

Document extraction uses the existing pdfjs-dist server module with strict limits: 200 PDF pages, 500,000 extracted characters, 1,500 chunks of up to 1,800 characters with 180 overlap. Text is indexed only from original READY PDFs, never generated summaries. An atomic server-only claim prevents a second request from concurrently deleting or replacing another active index build; stale claims older than four minutes can be retried. READY status is assigned only after all chunks have been inserted. Failure does not delete or change the Source Collection. The backfill endpoint indexes at most two older PDFs per request; repeated requests continue incrementally.

The retrieval function uses PostgreSQL simple-dictionary full-text search with OR matches and verified source SHA matching. Follow-up questions may be expanded with actor/CVE identifiers from earlier conversation analyses; these are used ONLY as search hints. This is lexical RAG, NOT semantic pgvector retrieval.

Every indexed snippet gets a per-answer MEM token and original asset/source/page provenance, verified using the same exact-quote verifier as DOC/ANN. Model outputs cannot create new source identities or citation tokens. Previous AI summaries and web pages are explicitly labeled untrusted. A quote is evidence only for the quoted observation, not proof of the model's broader hypothesis.

The event store records Stage 3 Analyse/Extract/Ask and Analyst Assessment/Web Research outcomes. The existing per-source turns and saved analyst notes remain unchanged. Old analysis results are NOT retroactively imported; future processed responses create events. Only user-approved intelligence records can become part of verified domain data.

## Rollout checklist

1. Verify prior migrations 064/065 exist. Apply 066 after all source dependencies are installed and after CI and security review. Live Supabase migration 066 is NOT applied by this PR.
2. Confirm PG16 acceptance tests cover RLS, anon revocation, owner/foreign-user source isolation, search and SHA mismatch.
3. Upload a searchable seven-page PDF and compare the page-level index with the original. Ensure sources with no extractable text do not falsely become READY.
4. Analyse Entire PDF, ask a related strategic question with only the cover page selected, and verify citations cite relevant interior pages. Switch PDFs and confirm no wrong-source navigation.
5. Try mixed-language Turkish/English queries and inspect false negatives; lexical matching is not a replacement for future semantic retrieval.
6. Confirm user switch, project switch, deletion cascade, interrupted indexing, repeated indexing and stale source hashes.
7. Measure cold vs warm PDF parsing latency, model queue time and verified-citation success rates.
8. Run real NVIDIA/Brave browser acceptance, responsive/accessibility review and storage retention/privacy review. NODE-6/7 must not be treated as passed merely because CI skips them.

## Known gaps / next work

A full production-grade memory engine additionally needs durable asynchronous jobs for scanned or 200+ page PDFs, OCR, source-version updates, resumable indexing under concurrency, embedding generation and hybrid multilingual pgvector retrieval, fine-grained user retention/deletion, hypothesis version history and cross-source navigation. These capabilities are deliberately not labeled implemented in this branch.

## Rollback

Disable indexing and the Analyst indexed retrieval while retaining the existing source-only fallback and prior chat history. The new database tables contain derived sensitive document text and should only be dropped following explicit data-retention review. Original Source Collection data is unaffected.
