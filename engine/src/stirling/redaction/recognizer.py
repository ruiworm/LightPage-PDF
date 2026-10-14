from __future__ import annotations

import os
import re
from collections.abc import Callable, Iterator
from functools import lru_cache
from importlib import import_module
from pathlib import Path
from threading import Lock
from typing import Literal, Protocol

from pydantic import BaseModel, ConfigDict, Field, FiniteFloat

from stirling.models import ApiModel

MODEL_ID = "iic/nlp_raner_named-entity-recognition_chinese-base-generic"
MODEL_ROOT = Path(__file__).resolve().parents[3] / ".model_cache" / "redaction-raner"
CATEGORY_MAP: dict[str, Literal["name", "company", "address"]] = {
    "PER": "name",
    "ORG": "company",
    "LOC": "address",
    "GPE": "address",
}


class ModelEntity(BaseModel):
    model_config = ConfigDict(extra="ignore")
    start: int = Field(ge=0)
    end: int = Field(ge=0)
    type: str
    prob: FiniteFloat | None = None


class ModelOutput(BaseModel):
    model_config = ConfigDict(extra="ignore")
    output: list[ModelEntity] = Field(default_factory=list)


class PipelineFactory(Protocol):
    def __call__(self, task: str, model: str, *, device: str) -> Callable[[str], object]: ...


class TextPage(ApiModel):
    index: int = Field(ge=0)
    text: str = Field(max_length=50000)


class EntityCandidate(ApiModel):
    page_index: int
    start: int
    end: int
    original: str
    category: Literal["name", "company", "address"]
    confidence: float | None = None


def text_chunks(text: str, size: int = 420, overlap: int = 64) -> Iterator[tuple[str, int]]:
    """Overlapping chunks retain original character offsets across sentence boundaries."""
    if size <= overlap or overlap < 0:
        raise ValueError("Chunk size must exceed overlap")
    start = 0
    while start < len(text):
        end = min(start + size, len(text))
        if end < len(text):
            boundary = max(text.rfind(mark, start + size // 2, end) for mark in "。！？；\n")
            if boundary >= 0:
                end = boundary + 1
        yield text[start:end], start
        if end == len(text):
            return
        start = max(start + 1, end - overlap)


def utf16_positions(text: str) -> list[int]:
    positions = [0]
    for char in text:
        positions.append(positions[-1] + (2 if ord(char) > 0xFFFF else 1))
    return positions


class LocalEntityRecognizer:
    def __init__(self, pipeline: Callable[[str], object] | None = None) -> None:
        self.pipeline = pipeline
        self.lock = Lock()

    def prepare(self) -> None:
        """Loads installed weights only; recognition never initiates a model download."""
        if self.pipeline is not None:
            return
        if not (MODEL_ROOT / "pytorch_model.bin").is_file():
            raise FileNotFoundError("NER_MODEL_MISSING")
        os.environ.setdefault("HF_HUB_OFFLINE", "1")
        os.environ.setdefault("MODELSCOPE_CACHE", str(MODEL_ROOT.parent))
        factory: PipelineFactory = import_module("modelscope.pipelines").pipeline
        import_module("torch").set_num_threads(min(4, os.cpu_count() or 1))
        self.pipeline = factory("named-entity-recognition", str(MODEL_ROOT), device="cpu")

    @lru_cache(maxsize=256)
    def detect_chunk(self, text: str) -> tuple[ModelEntity, ...]:
        self.prepare()
        if self.pipeline is None:
            raise RuntimeError("NER_MODEL_UNAVAILABLE")
        with self.lock:
            result = ModelOutput.model_validate(self.pipeline(text))
        return tuple(result.output)

    def detect_page(self, page: TextPage) -> list[EntityCandidate]:
        positions = utf16_positions(page.text)
        candidates: dict[tuple[int, int, str], EntityCandidate] = {}
        for text, offset in text_chunks(page.text):
            for entity in self.detect_chunk(text):
                category = CATEGORY_MAP.get(entity.type)
                if category is None or not 0 <= entity.start < entity.end <= len(text):
                    continue
                if entity.prob is not None and entity.prob < 0.05:
                    continue
                start, end = offset + entity.start, offset + entity.end
                original = page.text[start:end]
                if not original.strip() or re.fullmatch(r"[\s\d\W]+", original):
                    continue
                candidate = EntityCandidate(
                    page_index=page.index,
                    start=positions[start],
                    end=positions[end],
                    original=original,
                    category=category,
                    confidence=max(0.0, min(1.0, entity.prob)) if entity.prob is not None else None,
                )
                key = (start, end, category)
                previous = candidates.get(key)
                if previous is None or (candidate.confidence or 0) > (previous.confidence or 0):
                    candidates[key] = candidate
        return sorted(candidates.values(), key=lambda item: (item.start, -item.end))
