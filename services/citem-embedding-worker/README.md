# CITEM local E5 embedding worker

Self-hosted in an operator-controlled environment (BAYKUSH Node is a suitable target once access is configured). This package does NOT provision, expose or deploy the service.

- Model: intfloat/multilingual-e5-small (384 dimensions); all query/passage texts are locally processed.
- Set CITEM_EMBEDDING_MODEL_REVISION to an operator-verified 40-hex Hugging Face commit SHA.
- Set CITEM_EMBEDDING_API_KEY to a random secret at least 24 characters; do not check it into Git.
- Network: private network or strictly authenticated HTTPS reverse proxy; NEVER publicly expose port 8765.
- Disable request access logs and prevent model/cache/log disclosure.
- The CITEM API caller must set CITEM_SEMANTIC_RAG_ENABLED=1, CITEM_EMBEDDING_ENDPOINT, CITEM_EMBEDDING_ALLOWED_HOST and identical model revision/key.
- No source PDF/chunk text is sent unless the owner explicitly chooses and the source policy permits local semantic indexing.
- The model weights are downloaded from Hugging Face at first boot. Review their license, supply chain and resource usage before deployment.
- Docker startup does not imply the vector table was filled or that multilingual retrieval accuracy was measured.
