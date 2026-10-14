from __future__ import annotations

from stirling.redaction.recognizer import LocalEntityRecognizer, TextPage, text_chunks, utf16_positions


def test_chunk_overlap_preserves_entities_and_original_offsets():
    text = "前" * 418 + "张三住在北京市朝阳区示例路88号。" + "后" * 500
    chunks = list(text_chunks(text))
    assert all(text[offset : offset + len(chunk)] == chunk for chunk, offset in chunks)
    assert any("张三住在北京市朝阳区示例路88号" in chunk for chunk, _ in chunks)
    assert chunks[-1][1] + len(chunks[-1][0]) == len(text)


def test_offsets_match_javascript_utf16_and_duplicate_overlap_is_removed():
    text = "😀" + "前" * 350 + "张三" + "后" * 150

    def pipeline(chunk: str) -> object:
        start = chunk.find("张三")
        return {"output": [] if start < 0 else [{"start": start, "end": start + 2, "type": "PER", "prob": 0.91}]}

    results = LocalEntityRecognizer(pipeline).detect_page(TextPage(index=3, text=text))
    assert len(results) == 1
    assert results[0].start == 352
    assert results[0].end == 354
    assert results[0].original == "张三"
    assert results[0].page_index == 3
    assert utf16_positions("😀𠀀张") == [0, 2, 4, 5]


def test_missing_probability_is_not_fabricated_and_invalid_spans_are_rejected():
    def pipeline(_chunk: str) -> object:
        return {
            "output": [
                {"start": 0, "end": 2, "type": "PER"},
                {"start": 2, "end": 99, "type": "LOC", "prob": 0.95},
                {"start": 2, "end": 4, "type": "ORG", "prob": 0.01},
            ]
        }

    results = LocalEntityRecognizer(pipeline).detect_page(TextPage(index=0, text="张三信息"))
    assert len(results) == 1
    assert results[0].confidence is None


def test_pipeline_is_reused_for_repeated_text():
    calls: list[str] = []

    def pipeline(chunk: str) -> object:
        calls.append(chunk)
        return {"output": [{"start": 0, "end": 2, "type": "PER", "prob": 0.8}]}

    recognizer = LocalEntityRecognizer(pipeline)
    for index in range(3):
        recognizer.detect_page(TextPage(index=index, text="张三住在这里"))
    assert calls == ["张三住在这里"]
