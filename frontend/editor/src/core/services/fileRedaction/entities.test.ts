import { describe, expect, it } from "vitest";
import {
  defaultRedactionSettings,
  findHits,
  replacementsFor,
} from "@app/services/fileRedaction/rules";
import type {
  RedactionDocument,
  RedactionEntityCandidate,
} from "@app/types/fileRedaction";

function fixture(
  text: string,
  entities: RedactionEntityCandidate[] = [],
): RedactionDocument {
  return {
    id: "test",
    file: new File([], "fixture.pdf"),
    kind: "pdf",
    warnings: [],
    entities,
    pages: [
      { index: 0, width: 600, height: 800, source: "text", text, spans: [] },
    ],
  };
}
function entity(
  text: string,
  original: string,
  category: RedactionEntityCandidate["category"],
  confidence: number | null = 0.92,
): RedactionEntityCandidate {
  const start = text.indexOf(original);
  return {
    pageIndex: 0,
    start,
    end: start + original.length,
    original,
    category,
    confidence,
  };
}

describe("combined Chinese entity recognition", () => {
  it("protects headings and law references without excluding an ordinary Beijing address", () => {
    const text =
      "投保人信息\n被保险人资料\n原告信息\n根据第五百零九条第一款\n张三住在北京市朝阳区测试路88号。";
    const doc = fixture(text, [
      entity(text, "信息", "name"),
      entity(text, "资料", "name"),
      entity(text, "第五百零九条", "address"),
      entity(text, "北京市朝阳区测试路88号", "address"),
    ]);
    const hits = findHits(doc, defaultRedactionSettings);
    expect(hits.map((hit) => hit.original)).not.toContain("信息");
    expect(hits.map((hit) => hit.original)).not.toContain("资料");
    expect(hits.map((hit) => hit.original)).not.toContain("第五百零九条");
    expect(hits.some((hit) => hit.original === "北京市朝阳区测试路88号")).toBe(
      true,
    );
  });
  it("keeps complete field addresses instead of replacing them with shorter model fragments", () => {
    const text =
      "住所：北京市朝阳区测试路88号\n3栋502室\n联系电话：13900000000";
    const hits = findHits(
      fixture(text, [entity(text, "北京市朝阳区", "address")]),
      defaultRedactionSettings,
    );
    expect(hits.find((hit) => hit.category === "address")?.original).toBe(
      "北京市朝阳区测试路88号\n3栋502室",
    );
    expect(hits.find((hit) => hit.category === "address")?.source).toBe(
      "field",
    );
  });
  it("adds unlabelled model names with correct emoji offsets and exposes uncertain candidates", () => {
    const text = "😀陈蕴桐昨天到这里。程沐澄也到这里。";
    const hits = findHits(
      fixture(text, [
        entity(text, "陈蕴桐", "name"),
        entity(text, "程沐澄", "name", null),
      ]),
      defaultRedactionSettings,
    );
    const known = hits.find((hit) => hit.original === "陈蕴桐")!;
    expect(known).toMatchObject({
      start: 2,
      source: "model",
      selected: true,
      review: true,
      confidence: 0.92,
    });
    expect(hits.find((hit) => hit.original === "程沐澄")).toMatchObject({
      source: "model",
      selected: false,
      review: true,
    });
  });
  it("respects preserved words and disabling the model", () => {
    const text = "陈蕴桐昨天到这里。";
    const doc = fixture(text, [entity(text, "陈蕴桐", "name")]);
    expect(
      findHits(doc, {
        ...defaultRedactionSettings,
        preservedWords: ["陈蕴桐"],
      }),
    ).toHaveLength(0);
    expect(
      findHits(doc, { ...defaultRedactionSettings, ner: false }),
    ).toHaveLength(0);
  });
  it("propagates a supported model name to a repeated mention on another page", () => {
    const text = "陈蕴桐昨天到了办公室。";
    const doc = fixture(text, [entity(text, "陈蕴桐", "name", 0.24)]);
    doc.pages.push({ ...doc.pages[0], index: 1, text: "陈蕴桐昨天离开了。" });
    expect(findHits(doc, defaultRedactionSettings)).toMatchObject([
      { original: "陈蕴桐", pageIndex: 0, source: "model", selected: true },
      { original: "陈蕴桐", pageIndex: 1, source: "repeat", selected: true },
    ]);
  });
  it("does not interpret a heading's following sentence as a name field", () => {
    const text = "投保人信息\n陈蕴桐昨天到了办公室。";
    const doc = fixture(text, [entity(text, "陈蕴桐", "name", 0.24)]);
    doc.pages[0].source = "text";
    for (const [line, value] of text.split("\n").entries()) {
      const start = text.indexOf(value);
      Array.from(value).forEach((_, index) =>
        doc.pages[0].spans.push({
          start: start + index,
          end: start + index + 1,
          rect: {
            x: 40 + index * 16,
            y: 30 + line * 42,
            width: 16,
            height: 16,
          },
        }),
      );
    }
    expect(findHits(doc, defaultRedactionSettings)).toMatchObject([
      { original: "陈蕴桐", source: "model" },
    ]);
  });
  it("does not merge two people with the same surname", () => {
    const hits = findHits(
      fixture("原告：张三\n被告：张四"),
      defaultRedactionSettings,
    );
    const replacements = replacementsFor(hits, "alias", { name: "人物" });
    expect(replacements.get(hits[0].id)).toBe("人物1");
    expect(replacements.get(hits[1].id)).toBe("人物2");
  });
  it("links a declared company abbreviation to its full name consistently", () => {
    const hits = findHits(
      fixture("杭州示例有限公司（以下简称“示例公司”）。\n示例公司履行合同。"),
      defaultRedactionSettings,
    );
    const companies = hits.filter((hit) => hit.category === "company");
    expect(companies.map((hit) => hit.original)).toEqual([
      "杭州示例有限公司",
      "示例公司",
      "示例公司",
    ]);
    const replacements = replacementsFor(companies, "alias", {
      company: "单位",
    });
    expect(new Set(companies.map((hit) => replacements.get(hit.id)))).toEqual(
      new Set(["单位1"]),
    );
  });
  it("does not propagate an ambiguous abbreviation across companies", () => {
    const hits = findHits(
      fixture(
        "杭州甲有限公司（以下简称“示例公司”）。\n杭州乙有限公司（以下简称“示例公司”）。\n示例公司履行合同。",
      ),
      defaultRedactionSettings,
    );
    expect(hits.some((hit) => hit.original === "示例公司")).toBe(false);
  });
});
