from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import Field

from stirling.models import ApiModel
from stirling.redaction.recognizer import EntityCandidate, LocalEntityRecognizer, TextPage


class RecognitionRequest(ApiModel):
    pages: list[TextPage] = Field(min_length=1, max_length=100)


class RecognitionResponse(ApiModel):
    entities: list[EntityCandidate]


recognizer = LocalEntityRecognizer()
recognition_slot = asyncio.Semaphore(1)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    await asyncio.to_thread(recognizer.prepare)
    yield
    recognizer.detect_chunk.cache_clear()


app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None)
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^https?://(?:localhost|127\.0\.0\.1|\[::1\]|tauri\.localhost)(?::\d{1,5})?$",
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ready", "model": "raner", "processing": "local"}


@app.post("/entities", response_model=RecognitionResponse)
async def entities(payload: RecognitionRequest, request: Request) -> RecognitionResponse:
    if sum(len(page.text) for page in payload.pages) > 500000:
        raise HTTPException(status_code=413, detail="NER_TEXT_TOO_LARGE")
    output: list[EntityCandidate] = []
    async with recognition_slot:
        for page in payload.pages:
            if await request.is_disconnected():
                raise HTTPException(status_code=499, detail="CANCELLED")
            output.extend(await asyncio.to_thread(recognizer.detect_page, page))
    return RecognitionResponse(entities=output)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=5161, log_level="warning")
