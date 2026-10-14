import { describe, expect, it } from "vitest";
import {
  defaultRedactionSettings,
  findHits,
  hitRects,
  parseDictionary,
  replacementsFor,
  replaceRanges,
} from "@app/services/fileRedaction/rules";
import type {
  RedactionDocument,
  RedactionPage,
} from "@app/types/fileRedaction";

function documentFor(text: string): RedactionDocument {
  return {
    id: "fixture",
    file: new File([], "fixture.pdf"),
    kind: "pdf",
    warnings: [],
    pages: [
      { index: 0, width: 300, height: 400, text, spans: [], source: "text" },
    ],
  };
}

describe("file redaction detection", () => {
  it("preserves technical resume prose without seeding repeated person matches", () => {
    const doc = documentFor(
      "联系人：解明\n微服务封装与容器化部署：封装核心业务接口。\n字段解析与结构化处理：字段解析可复用。\n解明和张三共同负责接口开发。",
    );
    const hits = findHits(doc, {
      ...defaultRedactionSettings,
      categories: ["name"],
    });
    expect(hits.map((hit) => hit.original)).toEqual(["解明", "解明", "张三"]);
    const redacted = replaceRanges(
      doc.pages[0].text,
      hits,
      replacementsFor(hits, "blackout", {}),
      true,
    );
    expect(redacted).toContain("微服务封装与容器化部署：封装核心业务接口。");
    expect(redacted).toContain("字段解析与结构化处理：字段解析可复用。");
  });

  it("keeps uncommon surnames and explicit dictionary matches", () => {
    const text =
      "联系人：封远\n段宁和解明共同负责测试。\n微服务封装与容器化部署。";
    const doc = documentFor(text);
    const settings = {
      ...defaultRedactionSettings,
      categories: ["name" as const],
    };
    expect(findHits(doc, settings).map((hit) => hit.original)).toEqual([
      "封远",
      "段宁",
      "解明",
    ]);
    expect(
      findHits(doc, { ...settings, requiredWords: ["封装"] }).find(
        (hit) => hit.original === "封装",
      ),
    ).toMatchObject({
      source: "dictionary",
      selected: true,
    });
  });

  it("recognizes fields and repeats of the identified person in prose", () => {
    const doc = documentFor(
      "姓名：张三\n甲方：测试信息有限公司\n地址：测试市示例路一号\n张三参加会议\n电话：13900000000\n邮箱：qa@example.test",
    );
    const hits = findHits(doc, defaultRedactionSettings);
    expect(hits.map((hit) => hit.original)).toEqual([
      "张三",
      "测试信息有限公司",
      "测试市示例路一号",
      "张三",
      "13900000000",
      "qa@example.test",
    ]);
    expect(hits.find((hit) => hit.category === "name")?.review).toBe(true);
  });
  it.each([
    [
      "姓名 张三\n住址 浙江省杭州市滨江区示例路18号",
      "张三",
      "浙江省杭州市滨江区示例路18号",
    ],
    [
      "姓 名：欧阳 明\n通讯地址：浙江省杭州市滨江区示例路18号",
      "欧阳 明",
      "浙江省杭州市滨江区示例路18号",
    ],
    [
      "收件人李四，收货地址浙江省杭州市滨江区示例路18号",
      "李四",
      "浙江省杭州市滨江区示例路18号",
    ],
    [
      "Name: john smith\nAddress: 18 Example Road, Test City",
      "john smith",
      "18 Example Road, Test City",
    ],
  ])("recognizes common field formatting: %s", (text, name, address) => {
    const hits = findHits(documentFor(text), defaultRedactionSettings);
    expect(hits.map((hit) => hit.original)).toEqual([name, address]);
  });
  it("stops at neighbouring fields instead of including them in names and addresses", () => {
    const hits = findHits(
      documentFor(
        "姓名：陈宁 性别：女\n地址：广东省深圳市南山区示例路18号 电话：13900000000",
      ),
      defaultRedactionSettings,
    );
    expect(hits.map((hit) => hit.original)).toEqual([
      "陈宁",
      "广东省深圳市南山区示例路18号",
      "13900000000",
    ]);
  });
  it.each(["现居地址", "居住地址"])(
    "covers the entire wrapped resume address after %s",
    (label) => {
      const doc = documentFor(
        `${label} 广州市南山区科技园科苑\r\n路15号\r\n求职意向\r\n职位：运维工程师`,
      );
      const page = doc.pages[0];
      for (const [row, line] of page.text.split("\r\n").entries()) {
        const offset = page.text.indexOf(line);
        for (const [column, char] of Array.from(line).entries()) {
          page.spans.push({
            start: offset + column,
            end: offset + column + char.length,
            rect: { x: 30 + column * 10, y: row * 20, width: 9, height: 12 },
          });
        }
      }
      const hits = findHits(doc, {
        ...defaultRedactionSettings,
        categories: ["address"],
      });
      expect(hits.map((hit) => hit.original)).toEqual([
        "广州市南山区科技园科苑\r\n路15号",
      ]);
      expect(hits[0].selected).toBe(true);
      expect(hits[0].rects.map((rect) => rect.y)).toEqual([0, 20]);
    },
  );
  it("retains OCR spaces in wrapped addresses without masking the next field", () => {
    const hits = findHits(
      documentFor(
        "姓名：陈 宁\n通讯地址：浙江省杭州市滨江区青禾路77号\n3 栋 502 室\n公开正文：项目说明应当保留。",
      ),
      defaultRedactionSettings,
    );
    expect(hits.map((hit) => hit.original)).toEqual([
      "陈 宁",
      "浙江省杭州市滨江区青禾路77号\n3 栋 502 室",
    ]);
    expect(hits.every((hit) => hit.selected)).toBe(true);
  });
  it("does not extend an address into a following paragraph about routes", () => {
    const hits = findHits(
      documentFor(
        "现居地址：浙江省杭州市滨江区示例路18号\n路线说明：乘坐公交前往项目现场。",
      ),
      {
        ...defaultRedactionSettings,
        categories: ["address"],
      },
    );
    expect(hits.map((hit) => hit.original)).toEqual([
      "浙江省杭州市滨江区示例路18号",
    ]);
  });
  it("covers repeated names and addresses across pages without treating unrelated prose as a person", () => {
    const doc = documentFor("姓名：陈宁\n地址：浙江省杭州市滨江区示例路18号");
    doc.pages.push({
      ...doc.pages[0],
      index: 1,
      text: "陈宁到访浙江省杭州市滨江区示例路18号。公开项目说明。",
    });
    const hits = findHits(doc, defaultRedactionSettings);
    expect(
      hits.filter((hit) => hit.pageIndex === 1).map((hit) => hit.original),
    ).toEqual(["陈宁", "浙江省杭州市滨江区示例路18号"]);
  });
  it.each(["text", "ocr"] as const)(
    "finds names and addresses beneath %s table headers using their page positions",
    (source) => {
      const doc = documentFor("");
      const page = doc.pages[0];
      page.source = source;
      const cells: [string, number, number][] = [
        ["姓名", 30, 10],
        ["性别", 150, 10],
        ["陈宁", 30, 35],
        ["女", 148, 35],
        ["通讯地址", 30, 70],
        ["邮编", 250, 70],
        ["浙江省杭州市滨江区示例路18号", 30, 95],
        ["310000", 248, 95],
      ];
      for (const [text, x, y] of cells) {
        for (let i = 0; i < text.length; i++) {
          const start = page.text.length;
          page.text += text[i];
          page.spans.push({
            start,
            end: start + 1,
            rect: { x: x + i * 10, y, width: 9, height: 12 },
          });
        }
        page.text += source === "ocr" && x === 30 ? "" : "\n";
      }
      const hits = findHits(doc, defaultRedactionSettings);
      expect(hits.map((hit) => hit.original)).toEqual([
        "陈宁",
        "浙江省杭州市滨江区示例路18号",
      ]);
      expect(hits.every((hit) => hit.rects.length > 0)).toBe(true);
      expect(hits[0].rects[0].y).toBe(35);
      expect(hits[1].rects[0].y).toBe(95);
    },
  );
  it("does not mistake field instructions or labels for values", () => {
    const hits = findHits(
      documentFor("请填写姓名和地址。\n姓名\n性别\n住址\n联系方式"),
      defaultRedactionSettings,
    );
    expect(hits).toEqual([]);
  });
  it("preserves section headings without losing names or company names containing 信息", () => {
    const hits = findHits(
      documentFor(
        "投保人信息\n姓名：张强\n被保险人信息\n被保险人：张莉宁\n受益人信息\n受益人：程然\n联系人基本资料\n联系人：李信息\n地址信息\n地址：浙江省杭州市滨江区示例路18号\n甲方：测试信息有限公司\n公开正文：信息应当保留。",
      ),
      defaultRedactionSettings,
    );
    expect(hits.map((hit) => hit.original)).toEqual([
      "张强",
      "张莉宁",
      "程然",
      "李信息",
      "浙江省杭州市滨江区示例路18号",
      "测试信息有限公司",
    ]);
  });
  it.each(["text", "ocr"] as const)(
    "does not use %s section headings as form field labels",
    (source) => {
      const doc = documentFor("");
      const page = doc.pages[0];
      page.source = source;
      for (const [row, text] of [
        "投保人信息",
        "被保险人 信息",
        "受 益 人 信 息",
        "联系人基本资料",
        "姓名：陈宁",
      ].entries()) {
        for (const [column, char] of Array.from(text).entries()) {
          const start = page.text.length;
          page.text += char;
          page.spans.push({
            start,
            end: page.text.length,
            rect: {
              x: 30 + column * 10,
              y: 20 + row * 30,
              width: 9,
              height: 12,
            },
          });
        }
        page.text += "\n";
      }
      expect(
        findHits(doc, defaultRedactionSettings).map((hit) => hit.original),
      ).toEqual(["陈宁"]);
    },
  );
  it.each(["text", "ocr"] as const)(
    "uses %s insurance section context to find names in the first value cell",
    (source) => {
      const doc = documentFor("");
      const page = doc.pages[0];
      page.width = 600;
      page.source = source;
      const cells: [string, number, number][] = [
        ["投保人信息", 30, 20],
        ["张强", 100, 55],
        ["女", 250, 55],
        ["出生日期", 340, 55],
        ["1997年11月7日", 440, 55],
        ["被保险人信息", 30, 110],
        ["张莉宁", 140, 145],
        ["身份证号码", 320, 145],
        ["受益人信息", 30, 200],
        ["程然", 140, 235],
        ["身份证号码", 320, 235],
      ];
      for (const [text, x, y] of cells) {
        for (const [column, char] of Array.from(text).entries()) {
          const start = page.text.length;
          page.text += char;
          page.spans.push({
            start,
            end: page.text.length,
            rect: { x: x + column * 10, y, width: 9, height: 12 },
          });
        }
        page.text += "\n";
      }
      expect(
        findHits(doc, defaultRedactionSettings).map((hit) => hit.original),
      ).toEqual(["张强", "张莉宁", "程然"]);
    },
  );
  it("identifies people and complete street addresses in prose without form labels", () => {
    const hits = findHits(
      documentFor(
        "本协议由张三和李四共同签署。陈宁女士在浙江省杭州市滨江区示例路18号居住。李经理负责公示，公开正文保留。",
      ),
      defaultRedactionSettings,
    );
    expect(hits.map((hit) => hit.original)).toEqual([
      "张三",
      "李四",
      "陈宁",
      "浙江省杭州市滨江区示例路18号",
    ]);
    expect(hits.every((hit) => hit.review)).toBe(true);
  });
  it("keeps wrapped addresses complete and honours exclusions and disabled categories", () => {
    const doc = documentFor(
      "姓名：张 三\n地址：浙江省杭州市\n滨江区示例路18号\n张三参加会议。公开正文保留。",
    );
    const hits = findHits(doc, defaultRedactionSettings);
    expect(hits.map((hit) => hit.original)).toEqual([
      "张 三",
      "浙江省杭州市\n滨江区示例路18号",
      "张三",
    ]);
    expect(
      findHits(doc, { ...defaultRedactionSettings, categories: ["phone"] }),
    ).toEqual([]);
    expect(
      findHits(doc, {
        ...defaultRedactionSettings,
        preservedWords: ["张三", "张 三"],
      }).every((hit) => hit.category !== "name"),
    ).toBe(true);
  });
  it("does not consume a second line of digits as a phone number", () => {
    const hits = findHits(
      documentFor("电话：13900000000\n2026"),
      defaultRedactionSettings,
    );
    expect(hits.map((hit) => hit.original)).toEqual(["13900000000"]);
  });
  it("uses required dictionary entries once and allows preserved phrases", () => {
    const doc = documentFor("测试张三，qa@example.test，qa@example.test");
    const hits = findHits(doc, {
      ...defaultRedactionSettings,
      requiredWords: ["测试张三", "qa@example.test"],
      preservedWords: ["qa@example.test"],
    });
    expect(hits.map((hit) => hit.original)).toEqual(["测试张三"]);
    const searched = findHits(doc, defaultRedactionSettings, "qa@example.test");
    expect(searched).toHaveLength(2);
    expect(searched.every((hit) => hit.manual)).toBe(true);
  });
  it("deduplicates overlapping automatic and dictionary matches", () => {
    const hits = findHits(documentFor("电话：13900000000"), {
      ...defaultRedactionSettings,
      requiredWords: ["13900000000"],
    });
    expect(hits).toHaveLength(1);
    expect(hits[0].category).toBe("custom");
  });
  it("does not treat every long number or invalid IPv4 as sensitive", () => {
    const doc = documentFor("1234567890123456 999.2.3.4 192.168.0.1");
    const hits = findHits(doc, {
      ...defaultRedactionSettings,
      categories: ["account", "ip"],
    });
    expect(hits.map((hit) => hit.original)).toEqual(["192.168.0.1"]);
  });
  it("keeps aliases consistent across documents without exporting the mapping", () => {
    const a = findHits(
      documentFor("姓名：张三\n姓名：李四"),
      defaultRedactionSettings,
    );
    const b = findHits(
      { ...documentFor("姓名：张三"), id: "second" },
      defaultRedactionSettings,
    );
    const replacements = replacementsFor([...a, ...b], "alias", {
      name: "人物",
    });
    expect(a.map((hit) => replacements.get(hit.id))).toEqual([
      "人物1",
      "人物2",
    ]);
    expect(replacements.get(b[0].id)).toBe("人物1");
  });
  it("handles Unicode offsets and excluded occurrences without changing the source", () => {
    const doc = documentFor("😀姓名：张三，电话：13900000000");
    const hits = findHits(doc, defaultRedactionSettings);
    hits[0].selected = false;
    const output = replaceRanges(
      doc.pages[0].text,
      hits,
      replacementsFor(hits, "partial", {}),
    );
    expect(output).toBe("😀姓名：张三，电话：139****0000");
    expect(doc.pages[0].text).toContain("13900000000");
  });
  it("joins glyph boxes on one line and preserves multiline coverage", () => {
    const page: RedactionPage = {
      ...documentFor("ABC").pages[0],
      spans: [
        { start: 0, end: 1, rect: { x: 10, y: 10, width: 8, height: 10 } },
        { start: 1, end: 2, rect: { x: 19, y: 10, width: 8, height: 10 } },
        { start: 2, end: 3, rect: { x: 10, y: 25, width: 8, height: 10 } },
      ],
    };
    expect(hitRects(page, 0, 3)).toEqual([
      { x: 10, y: 10, width: 17, height: 10 },
      { x: 10, y: 25, width: 8, height: 10 },
    ]);
  });
  it("joins Chinese, low punctuation and Latin glyphs without absorbing a neighboring row", () => {
    const page: RedactionPage = {
      ...documentFor("青禾，A3栋").pages[0],
      spans: [
        { start: 0, end: 1, rect: { x: 10, y: 150, width: 13, height: 13 } },
        { start: 1, end: 2, rect: { x: 24, y: 150, width: 13, height: 13 } },
        { start: 2, end: 3, rect: { x: 39, y: 159, width: 3, height: 4 } },
        { start: 3, end: 4, rect: { x: 46, y: 152, width: 8, height: 10 } },
        { start: 4, end: 6, rect: { x: 58, y: 176, width: 24, height: 13 } },
      ],
    };
    expect(hitRects(page, 0, 6)).toEqual([
      { x: 10, y: 150, width: 44, height: 13 },
      { x: 58, y: 176, width: 24, height: 13 },
    ]);
  });
  it("normalizes imported dictionaries", () => {
    expect(parseDictionary(" 张三\r\n李四\n张三\n \n")).toEqual([
      "张三",
      "李四",
    ]);
  });
});
