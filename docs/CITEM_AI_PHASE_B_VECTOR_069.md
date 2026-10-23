# Phase B 069 vector rollout

Exact vector dimension: 384; public model reference https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/maas/e5/multilingual-e5-small

Model **runtime** is not deployed by this migration. Embedding rows require current source SHA, extraction run and 40-hex verified revision, explicit approved source embedding flag. No PDF content is sent externally.

- Apply after migration 068.
- SQL RPC uses security invoker and filters before nearest-neighbor top-k.
- Small dataset: exact cosine search, no HNSW or IVFFlat yet.
- Automatic feature switch: OFF until local/approved provider, reviewed consent, RLS and gold benchmarks.
- Model change = new revision, NEVER reuse incompatible vectors.
- 066/067/068 originals and prior READY/PDF bytes are unchanged.
