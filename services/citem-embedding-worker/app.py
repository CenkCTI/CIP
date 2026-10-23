"""Self-hosted, authenticated multilingual E5-small embeddings.

Never logs request bodies. Never calls an embedding API with user text.
The model is downloaded by the operator during deployment at a pinned
40-character Hugging Face commit revision.
"""
import hmac
import os
import re
from functools import lru_cache

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

MODEL = "intfloat/multilingual-e5-small"
REVISION = os.environ.get("CITEM_EMBEDDING_MODEL_REVISION", "")
KEY = os.environ.get("CITEM_EMBEDDING_API_KEY", "")

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)


class EmbeddingRequest(BaseModel):
    model: str
    revision: str
    encoding_format: str = "float"
    input: list[str] = Field(min_length=1, max_length=16)


def require_key(authorization: str = Header(default="")) -> None:
    if len(KEY) < 24 or not hmac.compare_digest(
        authorization, "Bearer " + KEY
    ):
        raise HTTPException(status_code=401, detail="Unauthorized")


@lru_cache(maxsize=1)
def load_model():
    if not re.fullmatch(r"[a-f0-9]{40}", REVISION):
        raise RuntimeError("Pin the real, immutable model revision")
    from sentence_transformers import SentenceTransformer

    return SentenceTransformer(
        MODEL, revision=REVISION, trust_remote_code=False
    )


@app.get("/health")
def health():
    return {"status": "configured" if len(KEY) >= 24 and re.fullmatch(
        r"[a-f0-9]{40}", REVISION
    ) else "unconfigured"}


@app.post("/v1/embeddings", dependencies=[Depends(require_key)])
def embed(request: EmbeddingRequest):
    if request.model != MODEL or request.revision != REVISION:
        raise HTTPException(status_code=422, detail="Model mismatch")
    if request.encoding_format != "float" or any(
        len(text) > 1610 or not text.strip() or
        not (text.startswith("query: ") or text.startswith("passage: "))
        for text in request.input
    ):
        raise HTTPException(status_code=422, detail="Invalid input")
    try:
        result = load_model().encode(
            request.input,
            normalize_embeddings=True,
            convert_to_numpy=True,
            batch_size=8,
            show_progress_bar=False,
        ).tolist()
        if any(len(row) != 384 for row in result):
            raise RuntimeError("Unexpected dimensions")
        return {
            "model": MODEL,
            "revision": REVISION,
            "data": [
                {"index": i, "embedding": row}
                for i, row in enumerate(result)
            ],
        }
    except Exception:
        raise HTTPException(status_code=503, detail="Embedding unavailable")
