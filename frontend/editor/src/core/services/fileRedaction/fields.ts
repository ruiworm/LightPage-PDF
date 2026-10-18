import type { RedactionPage } from "@app/types/fileRedaction";
import filters from "@app/services/fileRedaction/entityFilters.json";

export type SensitiveField = "name" | "address";
export interface FieldMatch {
  start: number;
  end: number;
  category: SensitiveField;
  review: boolean;
}

const LABELS: Record<SensitiveField, string[]> = {
  name: [
    "姓名",
    "作者",
    "指导教师",
    "指导老师",
    "客户姓名",
    "联系人",
    "紧急联系人",
    "联系人员",
    "被保险人姓名",
    "被保险人",
    "投保人姓名",
    "投保人",
    "被保人",
    "借款人",
    "申请人",
    "受益人",
    "签字人",
    "法定代表人",
    "经办人",
    "收件人",
    "收货人",
    "原告",
    "被告",
    "当事人",
    "被上诉人",
    "上诉人",
    "被申请人",
    "申请执行人",
    "被执行人",
    "委托诉讼代理人",
    "委托代理人",
    "辩护人",
    "负责人",
    "授权代表",
    "患者",
    "Name",
    "Full Name",
  ],
  address: [
    "通讯地址",
    "通信地址",
    "联系地址",
    "注册地址",
    "居住地址",
    "现居地址",
    "家庭地址",
    "户籍地址",
    "户籍所在地",
    "现住址",
    "住宅地址",
    "收货地址",
    "收件地址",
    "详细地址",
    "住址",
    "住所地",
    "住所",
    "办公地址",
    "项目地点",
    "合同履行地点",
    "签约地点",
    "地址",
    "Address",
  ],
};
const OTHER_LABELS = [
  "性别",
  "出生日期",
  "身份证号码",
  "身份证号",
  "证件号码",
  "联系电话",
  "联系方式",
  "电话号码",
  "电话",
  "手机",
  "邮箱",
  "邮政编码",
  "邮编",
  "民族",
  "职业",
  "保费",
  "保险金额",
  "签字",
  "备注",
  "公开正文",
  "注册资本",
  "经营范围",
  "成立日期",
  "付款方式",
  "合同金额",
  "履行期限",
  "违约责任",
  "争议解决",
  "Phone",
  "Email",
  "Gender",
];
const normalized = (text: string) => text.replace(/\s/g, "").toLowerCase();
const escapePattern = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const labelPattern = (labels: string[]) =>
  [...labels]
    .sort((a, b) => b.length - a.length)
    .map((label) =>
      /\p{Script=Han}/u.test(label)
        ? Array.from(label).map(escapePattern).join("[ \\t]*")
        : escapePattern(label).replaceAll(" ", "[ \\t]+"),
    )
    .join("|");
const ALL_LABELS = [...LABELS.name, ...LABELS.address, ...OTHER_LABELS];
const LABEL_PATTERN = labelPattern([...LABELS.name, ...LABELS.address]);
const FIELD_END = new RegExp(`(?:${labelPattern(ALL_LABELS)})(?![a-z])`, "iu");
const FIELD_HEADING_SUFFIX = new RegExp(
  `^[ \\t]*(?:(?:${labelPattern(["基本", "相关"])})(?:[ \\t]*))?(?:${labelPattern(["信息", "资料", "详情"])})`,
  "u",
);
const NAME_ACTION =
  /先生|女士|同志|教授|医生|同学|参加|签署|签订|负责|提交|表示|确认|到访|出席|领取|担任|同意|出生/u;
const PERSON_PATTERN =
  "(?:欧阳|司马|上官|诸葛|东方|皇甫|尉迟|公孙|慕容|司徒|司空|夏侯|令狐|长孙|宇文|[赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜戚谢邹喻柏水窦章云苏潘葛奚范彭郎鲁韦昌马苗凤花方俞任袁柳鲍史唐费廉岑薛雷贺倪汤滕殷罗毕郝邬安常乐于傅皮卞齐康伍余元卜顾孟平黄穆萧尹姚邵汪祁毛禹狄米贝明臧计伏成戴宋茅庞熊纪舒屈项祝董梁杜阮蓝闵席季麻强贾路江童颜郭梅盛林钟徐邱骆高夏蔡田樊胡霍万柯卢莫房裘缪解应宗丁宣邓单杭洪包左石崔吉龚程邢裴陆荣翁荀羊惠甄曲封芮储靳焦牧侯全班秋仲伊宁仇刘景詹龙叶白怀蒲邰鄂索赖卓谭劳姬申冉桑牛温庄晏柴瞿阎连习艾鱼容向古易廖耿满弘文寇广阙巩聂晁勾敖冷辛曾沙关查游权盖桓岳帅缑亢况郜匡阚禄康窦燕支池仰甘台厉戎祖武符束刘段连凌简翟谭仉司郁单杭])(?:[ \\t]*[\\p{Script=Han}]){1,2}?";
const PROSE_PERSON = new RegExp(
  `(?:^|[\\s\\p{P}\\p{S}]|由|与|和|及|向|给|请|找)(${PERSON_PATTERN})(?=${NAME_ACTION.source})`,
  "gu",
);
const PROSE_PEOPLE = new RegExp(
  `(?:^|[\\s\\p{P}\\p{S}]|由|与|和|及|向|给|请|找)(${PERSON_PATTERN})(?:与|和|及)(${PERSON_PATTERN})(?=共同(?:${NAME_ACTION.source}))`,
  "gu",
);
const PERSON_NON_NAMES =
  /经理|先生|女士|教授|医生|同学|姓名|地址|王国|王朝|金钱|金属|周围|周边|周末|安全|常见|何时|何处|方可|费用|申请|封装|解析|容器|架构|接口|算法|模型|字段|框架|协议|文档|网络/u;
const ADDRESS_START =
  "(?:北京市?|上海市?|天津市?|重庆市?|(?:河北|山西|辽宁|吉林|黑龙江|江苏|浙江|安徽|福建|江西|山东|河南|湖北|湖南|广东|海南|四川|贵州|云南|陕西|甘肃|青海|台湾)省?|内蒙古(?:自治区)?|广西(?:壮族自治区)?|西藏(?:自治区)?|宁夏(?:回族自治区)?|新疆(?:维吾尔自治区)?|香港|澳门|(?:杭州|深圳|广州|成都|武汉|南京|苏州|郑州|西安|宁波|长沙|青岛|大连|厦门|福州|合肥|济南|沈阳|长春|哈尔滨|南昌|昆明|贵阳|兰州|南宁|海口|太原|石家庄)市)";
const PROSE_ADDRESS = new RegExp(
  `${ADDRESS_START}[^\\r\\n;；，,。:：]{1,55}?(?:路|街|巷|弄|村|大道)[\\p{Script=Han}\\dA-Za-z-]{0,20}?(?:[\\d一二三四五六七八九十百]+(?:号|弄|栋|幢|室|单元|楼)|(?:小区|大厦|公寓|花园))(?:(?:[\\d一二三四五六七八九十百]+)(?:号|弄|栋|幢|室|单元|楼)){0,5}`,
  "gu",
);

function proseMatches(text: string): FieldMatch[] {
  const matches: FieldMatch[] = [];
  for (const match of text.matchAll(PROSE_PERSON)) {
    if (isNonPersonText(match[1])) continue;
    const start = match.index + match[0].length - match[1].length;
    matches.push({
      start,
      end: start + match[1].length,
      category: "name",
      review: true,
    });
  }
  for (const match of text.matchAll(PROSE_PEOPLE)) {
    if (isNonPersonText(match[1]) || isNonPersonText(match[2])) continue;
    for (const [index, value] of [match[1], match[2]].entries()) {
      const start =
        match.index +
        (index === 0 ? match[0].indexOf(value) : match[0].lastIndexOf(value));
      matches.push({
        start,
        end: start + value.length,
        category: "name",
        review: true,
      });
    }
  }
  for (const match of text.matchAll(PROSE_ADDRESS))
    matches.push({
      start: match.index,
      end: match.index + match[0].length,
      category: "address",
      review: true,
    });
  return matches;
}

/** Classifies complete form labels, including spaces inserted by PDF text extraction or OCR. */
export function fieldLabelCategory(text: string): SensitiveField | undefined {
  const label = normalized(text.replace(/[:：=]/g, ""));
  return (["name", "address"] as const).find((category) =>
    LABELS[category].some((entry) => normalized(entry) === label),
  );
}

/** Filters unlabelled name candidates; explicit name fields and user dictionaries remain authoritative. */
export function isNonPersonText(value: string): boolean {
  const compact = normalized(value);
  return PERSON_NON_NAMES.test(compact) || filters.name.includes(compact);
}

export function isLikelyPersonName(value: string): boolean {
  return (
    !isNonPersonText(value) &&
    new RegExp(`^${PERSON_PATTERN}$`, "u").test(value)
  );
}

/** Unlabelled model guesses need a person-related phrase, not only a surname-shaped word. */
export function hasPersonContext(
  text: string,
  start: number,
  end: number,
): boolean {
  const before = text.slice(Math.max(0, start - 20), start);
  const after = text.slice(end, end + 20);
  return (
    /(?:姓名|作者|联系人|指导教师|指导老师|原告|被告|负责人)[ \t]*[:：]?[ \t]*$/u.test(
      before,
    ) ||
    /^(?:先生|女士|同志|教授|医生|同学|老师|参加|签署|签订|提交|表示|确认|到访|出席|领取|担任|出生|(?:昨天|今天|昨日|今日)?(?:来到|到了|到访|离开|负责))/u.test(
      after,
    )
  );
}

/** Word paragraph breaks can wrap an address; a continuation must still end like a location. */
export function isAddressContinuation(value: string): boolean {
  const compact = value.replace(/[ \t]/g, "").trim();
  return (
    /^(?:[\p{Script=Han}]{0,15}(?:区|县|街道|镇|乡|路|街|大道|村|巷)|[\d一二三四五六七八九十百]+(?:号|栋|幢|楼|室|单元))[\p{Script=Han}\dA-Za-z-]{0,45}$/u.test(
      compact,
    ) &&
    /(?:区|县|街道|镇|乡|路|街|村|号|栋|幢|楼|室|单元)[\dA-Za-z-]*$/u.test(
      compact,
    ) &&
    !NAME_ACTION.test(value) &&
    !FIELD_END.test(value)
  );
}

function valueRange(
  text: string,
  offset: number,
  category: SensitiveField,
  limit = text.length,
): FieldMatch | undefined {
  const leading =
    text.slice(offset, limit).match(/^[ \t\r\n]*/)?.[0].length ?? 0;
  const start = offset + leading;
  let end = Math.min(limit, start + (category === "name" ? 64 : 100));
  const segment = text.slice(start, end);
  const boundary = segment.search(
    category === "name" ? /[\r\n,，;；。:(（]/u : /[\r\n;；。]/u,
  );
  if (boundary >= 0) end = start + boundary;
  const nextField = text.slice(start, end).search(FIELD_END);
  if (nextField >= 0) end = start + nextField;
  if (category === "name") {
    const action = text.slice(start, end).search(NAME_ACTION);
    if (action >= 0) end = start + action;
  }
  end = start + text.slice(start, end).trimEnd().length;
  const value = text.slice(start, end);
  if (category === "name") {
    const compact = value.replace(/[ \t]/g, "");
    if (
      !/^(?:[\p{Script=Han}]{2,12}|[\p{Script=Han}]+(?:[·・][\p{Script=Han}]+)+)$/u.test(
        compact,
      ) &&
      !/^[a-z][a-z.'-]+(?:[ \t]+[a-z][a-z.'-]+){0,3}$/iu.test(value)
    )
      return;
  } else {
    if (normalized(value).length < 5 || !/\p{L}/u.test(value)) return;
    for (let lines = 0; lines < 2; lines++) {
      const rest = text.slice(end, limit);
      const continuation = rest.match(
        /^[ \t]*\r?\n[ \t]*([^\r\n;；。]{1,60})/u,
      );
      if (!continuation || !isAddressContinuation(continuation[1])) break;
      end += continuation[0].trimEnd().length;
    }
  }
  if (
    fieldLabelCategory(value) ||
    OTHER_LABELS.some((label) => normalized(label) === normalized(value))
  )
    return;
  return { start, end, category, review: true };
}

/** Ranges retain the source text's offsets; form geometry is only used to associate a header with its value. */
export function findFieldMatches(page: RedactionPage): FieldMatch[] {
  const matches: FieldMatch[] = proseMatches(page.text);
  const labels = [
    ...page.text.matchAll(
      new RegExp(
        `(?<![\\p{L}\\d])(${LABEL_PATTERN})(?:[ \\t]*[:：=][ \\t]*|[ \\t]+|(?=\\r?\\n)|(?=[\\p{Script=Han}]))`,
        "giu",
      ),
    ),
  ];
  for (const label of labels) {
    if (
      FIELD_HEADING_SUFFIX.test(page.text.slice(label.index + label[1].length))
    )
      continue;
    const category = fieldLabelCategory(label[1])!;
    const value = valueRange(
      page.text,
      label.index + label[0].length,
      category,
    );
    if (value) matches.push(value);
  }
  if (page.fieldCategory) {
    const value = valueRange(page.text, 0, page.fieldCategory);
    if (value) matches.push(value);
  }
  if (!page.spans.length) return matches;
  const labelBoxes = [
    ...page.text.matchAll(
      new RegExp(`(?:${labelPattern(ALL_LABELS)})(?![a-z])`, "giu"),
    ),
  ].flatMap((label) => {
    const heading = FIELD_HEADING_SUFFIX.exec(
      page.text.slice(label.index + label[0].length),
    );
    const labelEnd = label.index + label[0].length + (heading?.[0].length ?? 0);
    const spans = page.spans.filter(
      (span) => span.rect && span.start < labelEnd && span.end > label.index,
    );
    if (!spans.length) return [];
    const left = Math.min(...spans.map((span) => span.rect!.x));
    const top = Math.min(...spans.map((span) => span.rect!.y));
    const height = Math.max(...spans.map((span) => span.rect!.height));
    // OCR can join distant columns; a contiguous prefix is prose rather than a column label.
    if (
      page.spans.some(
        (span) =>
          span.rect &&
          span.end === label.index &&
          /\p{L}/u.test(page.text.slice(span.start, span.end)) &&
          Math.abs(span.rect.y - top) < height * 0.7 &&
          left - (span.rect.x + span.rect.width) < height * 0.8,
      )
    )
      return [];
    return [
      {
        label: label[0],
        start: label.index,
        x: left,
        y: top,
        height,
        heading: Boolean(heading),
      },
    ];
  });
  for (const label of labelBoxes) {
    const category = fieldLabelCategory(label.label);
    if (!category) continue;
    if (
      matches.some(
        (match) =>
          match.category === category &&
          page.spans.some(
            (span) =>
              span.rect &&
              span.start < match.end &&
              span.end > match.start &&
              span.rect.x > label.x &&
              Math.abs(span.rect.y - label.y) < label.height * 0.7,
          ),
      )
    )
      continue;
    const right = Math.min(
      page.width,
      ...labelBoxes
        .filter(
          (other) =>
            other.x > label.x &&
            Math.abs(other.y - label.y) < label.height * 0.7,
        )
        // Values may start slightly left of their headers, especially after OCR.
        .map((other) => other.x - other.height * 0.5),
    );
    const below = page.spans.filter(
      (span) =>
        span.rect &&
        span.rect.x >= label.x - label.height * 0.5 &&
        span.rect.x < right &&
        span.rect.y > label.y + label.height * 0.8 &&
        span.rect.y < label.y + label.height * 4 &&
        page.text.slice(span.start, span.end).trim(),
    );
    if (!below.length) continue;
    const row = Math.min(...below.map((span) => span.rect!.y));
    let spans = below.filter(
      (span) => Math.abs(span.rect!.y - row) < label.height * 0.7,
    );
    if (label.heading) {
      // Insurance section titles can replace a name label; later cells hold demographics.
      const ordered = [...spans].sort((a, b) => a.rect!.x - b.rect!.x);
      let rightEdge = ordered[0].rect!.x;
      const nextCell = ordered.findIndex((span) => {
        if (span.rect!.x - rightEdge > label.height * 1.5) return true;
        rightEdge = Math.max(rightEdge, span.rect!.x + span.rect!.width);
        return false;
      });
      spans = nextCell < 0 ? ordered : ordered.slice(0, nextCell);
    }
    const start = Math.min(...spans.map((span) => span.start));
    const end = Math.max(...spans.map((span) => span.end));
    if (
      page.spans.some(
        (span) =>
          span.start < end &&
          span.end > start &&
          page.text.slice(span.start, span.end).trim() &&
          !spans.includes(span),
      )
    )
      continue;
    const value = valueRange(page.text, start, category, end);
    // A heading may introduce a demographic table, but never an arbitrary paragraph.
    if (
      value &&
      (!label.heading ||
        isLikelyPersonName(normalized(page.text.slice(value.start, value.end))))
    )
      matches.push(value);
  }
  return matches;
}

/** Extends identified values to other occurrences in this document, including OCR-inserted spaces. */
export function repeatedFieldMatcher(
  values: { text: string; category: SensitiveField }[],
): { pattern: RegExp; categories: Map<string, SensitiveField> } | undefined {
  const categories = new Map(
    values.map((value) => [normalized(value.text), value.category]),
  );
  if (!categories.size) return;
  const pattern = [...categories.keys()]
    .sort((a, b) => b.length - a.length)
    .map((value) => {
      const literal = Array.from(value).map(escapePattern).join("\\s*");
      return /\p{Script=Han}/u.test(value)
        ? literal
        : `(?<![\\p{L}\\d])${literal}(?![\\p{L}\\d])`;
    })
    .join("|");
  return { pattern: new RegExp(pattern, "giu"), categories };
}

export const fieldValueKey = normalized;
