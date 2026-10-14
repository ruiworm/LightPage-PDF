import filters from "@app/services/fileRedaction/entityFilters.json";
import { isLikelyPersonName } from "@app/services/fileRedaction/fields";
import type {
  RedactionCategory,
  RedactionPage,
  RedactionEntityCandidate,
} from "@app/types/fileRedaction";

export interface DetectionCandidate {
  start: number;
  end: number;
  category: RedactionCategory;
  review: boolean;
  source?: "field" | "rule" | "dictionary" | "model" | "repeat" | "alias";
  confidence?: number;
  entityKey?: string;
}

const compact = (value: string) => value.replace(/\s/g, "");
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const TITLES =
  /(?:投保人|被保险人|受益人|原告|被告|当事人|个人|单位|公司|客户|联系人|姓名|地址)(?:基本|相关)?(?:信息|资料|详情)/gu;
const LAW_REFERENCES =
  /第[零一二三四五六七八九十百千万\d]+(?:条|款|项)(?:之[零一二三四五六七八九十百千万\d]+)?(?:第[零一二三四五六七八九十百千万\d]+(?:条|款|项))*/gu;

export function protectedEntityRanges(
  text: string,
): { start: number; end: number }[] {
  return [TITLES, LAW_REFERENCES].flatMap((pattern) =>
    [...text.matchAll(pattern)].map((match) => ({
      start: match.index,
      end: match.index + match[0].length,
    })),
  );
}

export function modelCandidates(
  page: RedactionPage,
  entities: RedactionEntityCandidate[],
): DetectionCandidate[] {
  const protectedRanges = protectedEntityRanges(page.text);
  return entities
    .filter((item) => {
      if (
        item.pageIndex !== page.index ||
        page.text.slice(item.start, item.end) !== item.original
      )
        return false;
      if (filters[item.category].includes(compact(item.original))) return false;
      return !protectedRanges.some(
        (range) => item.start < range.end && item.end > range.start,
      );
    })
    .map((item) => ({
      start: item.start,
      end: item.end,
      category: item.category,
      review: true,
      source: "model",
      confidence: item.confidence ?? undefined,
    }));
}

const ORG_DECLARATION =
  /(?:^|[\n：:，,。；;])\s*([\p{L}\d·（）() -]{2,70}?(?:有限责任公司|股份有限公司|有限公司|合伙企业|集团|事务所|研究院|大学|医院|银行))[\s（(，,]*(?:以下简称|下称|简称)[\s：:“"'「『]*([\p{L}\d·-]{2,20})/gu;

/** Explicit, unambiguous organization aliases share a key; surnames never identify a person. */
export function organizationAliases(
  pages: RedactionPage[],
): Map<number, DetectionCandidate[]> {
  const declarations: { full: string; alias: string }[] = [];
  for (const page of pages)
    for (const match of page.text.matchAll(ORG_DECLARATION)) {
      const full = match[1].trim();
      const alias = match[2];
      if (!filters.company.includes(alias) && full !== alias)
        declarations.push({ full, alias });
    }
  const known = new Map<string, Set<string>>();
  for (const { full, alias } of declarations) {
    for (const value of [full, alias]) {
      const identities = known.get(value) ?? new Set<string>();
      identities.add(full);
      known.set(value, identities);
    }
  }
  const output = new Map<number, DetectionCandidate[]>();
  for (const page of pages) {
    const matches: DetectionCandidate[] = [];
    for (const [value, identities] of known) {
      if (identities.size !== 1) continue;
      const full = [...identities][0];
      for (const match of page.text.matchAll(new RegExp(escape(value), "gu"))) {
        matches.push({
          start: match.index,
          end: match.index + match[0].length,
          category: "company",
          source: "alias",
          review: true,
          entityKey: `company\0${full}`,
        });
      }
    }
    output.set(page.index, matches);
  }
  return output;
}

export function candidatePriority(candidate: DetectionCandidate): number {
  return {
    dictionary: 120,
    field: 110,
    rule: 100,
    alias: 95,
    repeat: 90,
    model: 70,
  }[candidate.source ?? "field"];
}

/** RaNER scores are not calibrated probabilities; corroborating structure determines default selection. */
export function selectModelCandidate(
  candidate: DetectionCandidate,
  original: string,
): boolean {
  if (candidate.source !== "model") return true;
  if (candidate.confidence == null) return false;
  if (candidate.category === "name")
    return isLikelyPersonName(compact(original));
  if (candidate.category === "company")
    return /有限公司|合伙企业|集团|事务所|研究院|大学|医院|银行$/u.test(
      compact(original),
    );
  return /(?:路|街|巷|弄|村|大道).*(?:号|栋|室|单元|楼|小区|大厦|公寓)|\d+(?:号|栋|室|单元|楼)/u.test(
    compact(original),
  );
}
