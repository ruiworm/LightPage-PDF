import type {
  RedactionCategory,
  RedactionDocument,
  RedactionHit,
  RedactionPage,
  RedactionRect,
  RedactionSettings,
} from "@app/types/fileRedaction";
import {
  findFieldMatches,
  repeatedFieldMatcher,
  fieldValueKey,
} from "@app/services/fileRedaction/fields";
import {
  candidatePriority,
  modelCandidates,
  organizationAliases,
  selectModelCandidate,
  type DetectionCandidate,
} from "@app/services/fileRedaction/entities";

export const CATEGORY_GROUPS: {
  key: string;
  categories: RedactionCategory[];
}[] = [
  {
    key: "personal",
    categories: [
      "name",
      "identity",
      "phone",
      "email",
      "account",
      "passport",
      "social",
    ],
  },
  { key: "organization", categories: ["company", "address", "creditCode"] },
  {
    key: "business",
    categories: [
      "plate",
      "vin",
      "invoice",
      "property",
      "caseNumber",
      "documentNumber",
    ],
  },
  { key: "optional", categories: ["url", "ip", "amount", "date"] },
];

export const defaultRedactionSettings: RedactionSettings = {
  categories: [
    "identity",
    "phone",
    "email",
    "account",
    "creditCode",
    "name",
    "company",
    "address",
    "custom",
  ],
  method: "blackout",
  requiredWords: [],
  preservedWords: [],
  ocr: true,
  ner: true,
};

type Rule = {
  category: RedactionCategory;
  pattern: RegExp;
  group?: number;
  review?: boolean;
  valid?: (value: string) => boolean;
};
const RULES: Rule[] = [
  {
    category: "identity",
    pattern:
      /(?<!\d)[1-9]\d{5}(?:18|19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx](?!\d)/gu,
    review: true,
  },
  {
    category: "phone",
    pattern: /(?<!\d)(?:\+?86[\s-]?)?1[3-9]\d[\s-]?\d{4}[\s-]?\d{4}(?!\d)/gu,
  },
  {
    category: "phone",
    pattern:
      /(?:电话|联系电话|座机|Tel(?:ephone)?|Phone)\s*[:：]?\s*((?:\+?\d{1,3}[\s-]?)?(?:\(?\d{2,4}\)?[\s-])?\d[\d \t-]{5,17}\d)/giu,
    group: 1,
    review: true,
  },
  {
    category: "email",
    pattern: /[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)+/giu,
  },
  {
    category: "account",
    pattern:
      /(?:账号|账户|卡号|银行卡|Account|IBAN)\s*[:：]?\s*([A-Z]{2}\d{2}[A-Z\d ]{10,30}|\d[\d -]{8,28}\d)/giu,
    group: 1,
    review: true,
  },
  {
    category: "account",
    pattern: /(?<!\d)\d{16,19}(?!\d)/gu,
    valid: luhn,
    review: true,
  },
  {
    category: "creditCode",
    pattern: /(?<![A-Z\d])[159Y][1239][0-9A-HJ-NPQRTUWXY]{16}(?![A-Z\d])/gu,
    review: true,
  },
  {
    category: "company",
    pattern:
      /(?:单位名称|公司名称|甲方|乙方|收款单位|Company)\s*[:：]\s*([^\n；;，,]{3,60}?(?:有限公司|公司|集团|事务所|研究院|医院|大学|银行|Corporation|Ltd\.?|Inc\.?))/giu,
    group: 1,
    review: true,
  },
  {
    category: "plate",
    pattern:
      /[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼][A-Z][A-Z\d]{5,6}/gu,
    review: true,
  },
  {
    category: "vin",
    pattern: /(?<![A-Z\d])[A-HJ-NPR-Z\d]{17}(?![A-Z\d])/gu,
    review: true,
  },
  {
    category: "invoice",
    pattern: /(?:发票号码|发票号)\s*[:：]\s*(\d{8,20})/gu,
    group: 1,
    review: true,
  },
  {
    category: "property",
    pattern: /(?:不动产权证(?:书)?号|房产证号)\s*[:：]\s*([^\n；;，,]{5,60})/gu,
    group: 1,
    review: true,
  },
  {
    category: "passport",
    pattern:
      /(?:护照号码|护照号|通行证号|Passport)\s*[:：]\s*([A-Z\d]{5,20})/giu,
    group: 1,
    review: true,
  },
  {
    category: "caseNumber",
    pattern: /[（(]\d{4}[）)][\p{Script=Han}\d]{2,30}号/gu,
    review: true,
  },
  {
    category: "documentNumber",
    pattern: /[\p{Script=Han}]{1,10}[〔[(（]\d{4}[〕\])）]\s*\d{1,8}号/gu,
    review: true,
  },
  { category: "url", pattern: /https?:\/\/[^\s<>"，。；]+/giu },
  {
    category: "ip",
    pattern: /(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?![\d.])/gu,
    valid: (v) => v.split(".").every((p) => Number(p) <= 255),
  },
  {
    category: "amount",
    pattern: /(?:[¥￥$€]\s*\d[\d,.]*|\d[\d,.]*\s*(?:万元|亿元|元|USD|RMB))/gu,
    review: true,
  },
  {
    category: "date",
    pattern: /\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}日?/gu,
    review: true,
  },
  {
    category: "social",
    pattern:
      /(?:微信号|QQ号|社交账号|WeChat)\s*[:：]\s*([A-Za-z\d_-]{5,30})/giu,
    group: 1,
    review: true,
  },
];

function luhn(value: string): boolean {
  let sum = 0;
  for (let i = value.length - 1; i >= 0; i--) {
    let n = Number(value[i]);
    if ((value.length - 1 - i) % 2) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  return sum % 10 === 0 && !/^(\d)\1+$/.test(value);
}

export function parseDictionary(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[\r\n]+/)
        .map((word) => word.trim())
        .filter(Boolean),
    ),
  ];
}

export function hitRects(
  page: RedactionPage,
  start: number,
  end: number,
): RedactionRect[] {
  const boxes = page.spans
    .filter((s) => s.start < end && s.end > start && s.rect)
    .map((s) => s.rect!);
  const lines: RedactionRect[] = [];
  for (const box of boxes) {
    const last = lines.at(-1);
    if (
      last &&
      Math.abs(last.y + last.height / 2 - box.y - box.height / 2) <
        Math.max(last.height, box.height) * 0.55 &&
      box.x >= last.x &&
      box.x <= last.x + last.width + Math.max(last.height, box.height)
    ) {
      const right = Math.max(last.x + last.width, box.x + box.width);
      const bottom = Math.max(last.y + last.height, box.y + box.height);
      last.y = Math.min(last.y, box.y);
      last.width = right - last.x;
      last.height = bottom - last.y;
    } else lines.push({ ...box });
  }
  return lines;
}

export function findHits(
  document: RedactionDocument,
  settings: RedactionSettings,
  search?: string,
): RedactionHit[] {
  const hits: RedactionHit[] = [];
  const fields = document.pages.map((page) =>
    findFieldMatches(page).filter((match) =>
      settings.categories.includes(match.category),
    ),
  );
  const models = document.pages.map((page) =>
    settings.ner === false
      ? []
      : modelCandidates(page, document.entities ?? []).filter((candidate) =>
          settings.categories.includes(candidate.category),
        ),
  );
  const repeated = search
    ? undefined
    : repeatedFieldMatcher(
        document.pages.flatMap((page, index) =>
          [
            ...fields[index],
            ...models[index].filter(
              (
                match,
              ): match is DetectionCandidate & {
                category: "name" | "address";
              } =>
                (match.category === "name" || match.category === "address") &&
                selectModelCandidate(
                  match,
                  page.text.slice(match.start, match.end),
                  page.text,
                ),
            ),
          ].map((match) => ({
            text: page.text.slice(match.start, match.end),
            category: match.category,
          })),
        ),
      );
  const aliases = search
    ? new Map<number, DetectionCandidate[]>()
    : organizationAliases(document.pages);
  for (const [pagePosition, page] of document.pages.entries()) {
    const candidates: DetectionCandidate[] = [];
    if (!search) {
      if (
        page.tableCategory &&
        settings.categories.includes(page.tableCategory) &&
        page.text.trim()
      ) {
        const start = page.text.length - page.text.trimStart().length;
        candidates.push({
          start,
          end: page.text.trimEnd().length,
          category: page.tableCategory,
          review: false,
          source: "field",
        });
      }
      candidates.push(
        ...fields[pagePosition].map((field) => ({
          ...field,
          source: "field" as const,
        })),
      );
      candidates.push(...models[pagePosition]);
      candidates.push(
        ...(aliases.get(page.index) ?? []).filter((candidate) =>
          settings.categories.includes(candidate.category),
        ),
      );
      if (repeated)
        for (const match of page.text.matchAll(repeated.pattern)) {
          if (
            models[pagePosition].some(
              (candidate) =>
                candidate.start === match.index &&
                candidate.end === match.index + match[0].length,
            )
          )
            continue;
          candidates.push({
            start: match.index,
            end: match.index + match[0].length,
            category: repeated.categories.get(fieldValueKey(match[0]))!,
            review: true,
            source: "repeat",
          });
        }
    }
    if (!search)
      for (const rule of RULES) {
        if (!settings.categories.includes(rule.category)) continue;
        for (const match of page.text.matchAll(
          new RegExp(rule.pattern.source, rule.pattern.flags),
        )) {
          const original = match[rule.group ?? 0]?.trim();
          if (!original || (rule.valid && !rule.valid(original))) continue;
          const start =
            match.index + (rule.group ? match[0].lastIndexOf(original) : 0);
          candidates.push({
            start,
            end: start + original.length,
            category: rule.category,
            review: !!rule.review,
            source: "rule",
          });
        }
      }
    for (const word of search ? [search] : settings.requiredWords) {
      if (!word) continue;
      let start = page.text.indexOf(word);
      while (start >= 0) {
        candidates.push({
          start,
          end: start + word.length,
          category: "custom",
          review: false,
          source: "dictionary",
        });
        start = page.text.indexOf(word, start + word.length);
      }
    }
    // A field's complete value wins over a model fragment; manual dictionaries retain priority.
    candidates.sort(
      (a, b) =>
        candidatePriority(b) - candidatePriority(a) ||
        b.end - b.start - (a.end - a.start),
    );
    const accepted: typeof candidates = [];
    for (const candidate of candidates) {
      if (
        accepted.some(
          (hit) => candidate.start < hit.end && candidate.end > hit.start,
        )
      )
        continue;
      if (
        !search &&
        settings.preservedWords.some((word) => {
          let offset = page.text.indexOf(word);
          while (offset >= 0) {
            if (
              candidate.start < offset + word.length &&
              candidate.end > offset
            )
              return true;
            offset = page.text.indexOf(word, offset + word.length);
          }
          return false;
        })
      )
        continue;
      accepted.push(candidate);
    }
    for (const hit of accepted.sort((a, b) => a.start - b.start)) {
      const rects = hitRects(page, hit.start, hit.end);
      hits.push({
        ...hit,
        id: `${document.id}:${page.index}:${hit.start}:${hit.end}`,
        documentId: document.id,
        pageIndex: page.index,
        original: page.text.slice(hit.start, hit.end),
        rects,
        selected: selectModelCandidate(
          hit,
          page.text.slice(hit.start, hit.end),
          page.text,
        ),
        manual: !!search,
        review:
          hit.review ||
          ((page.source === "ocr" || page.spans.some((span) => span.ocr)) &&
            page.spans.some(
              (s) =>
                s.start < hit.end &&
                s.end > hit.start &&
                (s.confidence ?? 100) < 85,
            )),
      });
    }
  }
  return hits;
}

export function replacementsFor(
  hits: RedactionHit[],
  method: RedactionSettings["method"],
  labels: Partial<Record<RedactionCategory, string>>,
): Map<string, string> {
  const mappings = new Map<string, string>();
  const counts = new Map<RedactionCategory, number>();
  for (const hit of hits) {
    if (hit.replacement !== undefined) {
      mappings.set(hit.id, hit.replacement);
      continue;
    }
    let value = "";
    if (method === "full") value = "***";
    else if (method === "partial") {
      const chars = Array.from(hit.original);
      value =
        chars.length <= 2
          ? `${chars[0] ?? ""}*`
          : chars.length <= 6
            ? `${chars[0]}${"*".repeat(chars.length - 1)}`
            : `${chars.slice(0, 3).join("")}****${chars.slice(-4).join("")}`;
    } else if (method === "alias") {
      const key = hit.entityKey ?? `${hit.category}\0${hit.original}`;
      const existing = mappings.get(key);
      if (existing) value = existing;
      else {
        const count = (counts.get(hit.category) ?? 0) + 1;
        counts.set(hit.category, count);
        value = `${labels[hit.category] ?? labels.custom ?? "Item"}${count}`;
        mappings.set(key, value);
      }
    }
    mappings.set(hit.id, value);
  }
  return mappings;
}

export function replaceRanges(
  text: string,
  hits: RedactionHit[],
  replacements: Map<string, string>,
  blackout = false,
): string {
  let output = text;
  for (const hit of [...hits]
    .filter((h) => h.selected)
    .sort((a, b) => b.start - a.start)) {
    output =
      output.slice(0, hit.start) +
      (blackout
        ? "█".repeat(Math.min(12, Math.max(3, Array.from(hit.original).length)))
        : (replacements.get(hit.id) ?? "***")) +
      output.slice(hit.end);
  }
  return output;
}
