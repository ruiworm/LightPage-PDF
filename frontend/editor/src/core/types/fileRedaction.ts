export type RedactionCategory =
  | "name"
  | "identity"
  | "phone"
  | "email"
  | "account"
  | "address"
  | "company"
  | "creditCode"
  | "plate"
  | "vin"
  | "invoice"
  | "property"
  | "passport"
  | "caseNumber"
  | "documentNumber"
  | "url"
  | "ip"
  | "amount"
  | "date"
  | "social"
  | "custom"
  | "region";

export type RedactionMethod = "alias" | "partial" | "full" | "blackout";
export type RedactionKind = "pdf" | "docx" | "image" | "xlsx" | "csv";
export interface RedactionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface RedactionSpan {
  start: number;
  end: number;
  rect?: RedactionRect;
  confidence?: number;
  ocr?: boolean;
  /** The rectangle was measured from raster ink instead of estimated by OCR. */
  inkBounds?: boolean;
}
export interface RedactionPage {
  index: number;
  width: number;
  height: number;
  text: string;
  spans: RedactionSpan[];
  source: "text" | "ocr" | "word" | "table";
  part?: string;
  paragraph?: number;
  media?: string;
  fieldCategory?: "name" | "address";
  tableCell?: { sheet: number; row: number; column: number; reference: string };
  tableCategory?: RedactionCategory;
}
export interface RedactionTableSheet {
  name: string;
  hidden: boolean;
  header: boolean;
  part?: string;
  rows: number[][];
}
export interface RedactionDocument {
  id: string;
  file: File;
  kind: RedactionKind;
  pages: RedactionPage[];
  warnings: string[];
  entities?: RedactionEntityCandidate[];
  table?: {
    sheets: RedactionTableSheet[];
    /** Read-only parsing does not establish that the workbook is safe to redact. */
    previewOnly?: boolean;
    delimiter?: string;
    newline?: string;
  };
}
export interface RedactionEntityCandidate {
  pageIndex: number;
  start: number;
  end: number;
  original: string;
  category: "name" | "company" | "address";
  confidence?: number | null;
}
export type RedactionSource =
  | "field"
  | "rule"
  | "dictionary"
  | "model"
  | "repeat"
  | "alias"
  | "manual";
export interface RedactionHit {
  id: string;
  documentId: string;
  pageIndex: number;
  category: RedactionCategory;
  original: string;
  start: number;
  end: number;
  rects: RedactionRect[];
  selected: boolean;
  review: boolean;
  replacement?: string;
  manual?: boolean;
  source?: RedactionSource;
  confidence?: number;
  entityKey?: string;
}
export interface RedactionSettings {
  categories: RedactionCategory[];
  method: RedactionMethod;
  requiredWords: string[];
  preservedWords: string[];
  ocr: boolean;
  ner?: boolean;
}
export interface RedactionProgress {
  stage: "reading" | "ocr" | "recognition" | "export";
  file: string;
  page: number;
  total: number;
  fraction?: number;
}
