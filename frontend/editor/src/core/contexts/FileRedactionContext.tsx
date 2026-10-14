import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import type {
  RedactionCategory,
  RedactionDocument,
  RedactionHit,
  RedactionProgress,
  RedactionRect,
  RedactionSettings,
} from "@app/types/fileRedaction";
import {
  CATEGORY_GROUPS,
  defaultRedactionSettings,
  findHits,
  replacementsFor,
} from "@app/services/fileRedaction/rules";
import { useViewer } from "@app/contexts/ViewerContext";
import { generateId } from "@app/utils/generateId";

interface RedactionSession {
  settings: RedactionSettings;
  updateSettings: (next: Partial<RedactionSettings>) => void;
  documents: RedactionDocument[];
  hits: RedactionHit[];
  activeDocumentId: string | null;
  activePageIndex: number;
  focusHitId: string | null;
  preview: boolean;
  setPreview: (value: boolean) => void;
  drawing: boolean;
  setDrawing: (value: boolean) => void;
  wordView: string;
  setWordView: (value: string) => void;
  setActiveDocument: (id: string) => void;
  setActivePage: (index: number) => void;
  focusHit: (hit: RedactionHit) => void;
  analyse: (
    files: { file: File; id: string }[],
    regions?: { pageIndex: number; rect: RedactionRect }[],
  ) => Promise<void>;
  cancel: () => void;
  busy: boolean;
  progress: RedactionProgress | null;
  errors: { file: string; code: string }[];
  dismissErrors: () => void;
  changeHits: (
    ids: string[],
    patch: Partial<
      Pick<RedactionHit, "selected" | "replacement" | "category" | "review">
    >,
  ) => void;
  addSearch: (value: string) => number;
  redactColumn: (
    documentId: string,
    sheet: number,
    column: number,
    category: RedactionCategory,
    skipHeader: boolean,
  ) => void;
  addRegion: (rect: RedactionRect, pageIndex?: number) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  replacements: Map<string, string>;
  exportFiles: (ids: string[]) => Promise<File[]>;
}

const Context = createContext<RedactionSession | null>(null);
const DICTIONARY_KEY = "lightpage.file-redaction.dictionary.v1";
function initialSettings(): RedactionSettings {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(DICTIONARY_KEY) ?? "null",
    );
    if (
      value &&
      typeof value === "object" &&
      "requiredWords" in value &&
      "preservedWords" in value
    ) {
      const dictionary = value;
      if (
        Array.isArray(dictionary.requiredWords) &&
        Array.isArray(dictionary.preservedWords)
      )
        return {
          ...defaultRedactionSettings,
          requiredWords: dictionary.requiredWords.filter(
            (v): v is string => typeof v === "string",
          ),
          preservedWords: dictionary.preservedWords.filter(
            (v): v is string => typeof v === "string",
          ),
        };
    }
  } catch {
    /* Storage is optional; file processing remains local without it. */
  }
  return { ...defaultRedactionSettings };
}

export function FileRedactionProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { activeFileId, setActiveFileId, scrollActions } = useViewer();
  const [settings, setSettings] = useState(initialSettings);
  const [documents, setDocuments] = useState<RedactionDocument[]>([]);
  const [hits, setHits] = useState<RedactionHit[]>([]);
  const activeDocumentId = documents.some((doc) => doc.id === activeFileId)
    ? activeFileId
    : null;
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [focusHitId, setFocusHitId] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [wordView, setWordView] = useState("layout");
  const [progress, setProgress] = useState<RedactionProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<{ file: string; code: string }[]>([]);
  const [history, setHistory] = useState<RedactionHit[][]>([]);
  const [future, setFuture] = useState<RedactionHit[][]>([]);
  const job = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const documentsRef = useRef(documents);
  documentsRef.current = documents;

  const edit = useCallback(
    (next: RedactionHit[]) => {
      setHistory((previous) => [...previous.slice(-39), hits]);
      setFuture([]);
      setHits(next);
    },
    [hits],
  );

  const updateSettings = useCallback(
    (next: Partial<RedactionSettings>) => {
      const merged = { ...settings, ...next };
      setSettings(merged);
      if (next.requiredWords || next.preservedWords)
        try {
          localStorage.setItem(
            DICTIONARY_KEY,
            JSON.stringify({
              requiredWords: merged.requiredWords,
              preservedWords: merged.preservedWords,
            }),
          );
        } catch {
          /* A full storage quota does not prevent using the dictionary this session. */
        }
      if (
        next.categories ||
        next.requiredWords ||
        next.preservedWords ||
        next.ner !== undefined
      ) {
        const old = new Map(hits.map((hit) => [hit.id, hit]));
        const manual = hits.filter(
          (hit) => hit.manual || hit.category === "region",
        );
        edit(
          documents
            .flatMap((document) =>
              findHits(document, merged)
                .filter(
                  (hit) =>
                    !manual.some(
                      (existing) =>
                        existing.documentId === hit.documentId &&
                        existing.pageIndex === hit.pageIndex &&
                        existing.start < hit.end &&
                        existing.end > hit.start,
                    ),
                )
                .map((hit) =>
                  old.has(hit.id)
                    ? {
                        ...hit,
                        selected: old.get(hit.id)!.selected,
                        replacement: old.get(hit.id)!.replacement,
                        review: old.get(hit.id)!.review,
                      }
                    : hit,
                ),
            )
            .concat(manual),
        );
      }
    },
    [documents, edit, hits, settings],
  );

  const setActiveDocument = useCallback(
    (id: string) => {
      setActiveFileId(id);
      setActivePageIndex(0);
      setFocusHitId(null);
    },
    [setActiveFileId],
  );
  useEffect(() => {
    setActivePageIndex(0);
    setFocusHitId(null);
    setDrawing(false);
  }, [activeFileId]);

  const cancel = useCallback(() => {
    generation.current++;
    job.current?.abort();
    job.current = null;
    setBusy(false);
    setProgress(null);
  }, []);

  const analyse = useCallback(
    async (
      files: { file: File; id: string }[],
      regions?: { pageIndex: number; rect: RedactionRect }[],
    ) => {
      if (job.current || !files.length) return;
      const controller = new AbortController();
      job.current = controller;
      const version = ++generation.current;
      setBusy(true);
      setErrors([]);
      setPreview(false);
      setDrawing(false);
      const created: RedactionDocument[] = [];
      const report = (value: RedactionProgress) => {
        if (generation.current === version) setProgress(value);
      };
      let disposeOcr: (() => Promise<void>) | undefined;
      try {
        const { analyseRedactionFile, disposeRedactionDocument } =
          await import("@app/services/fileRedaction/documents");
        const { LocalRedactionOcr } =
          await import("@app/services/fileRedaction/ocr");
        const { recognizeDocumentEntities } =
          await import("@app/services/fileRedaction/ner");
        const ocr = new LocalRedactionOcr();
        disposeOcr = () => ocr.dispose();
        for (const entry of files) {
          if (controller.signal.aborted) break;
          report({
            stage: "reading",
            file: entry.file.name,
            page: 0,
            total: 1,
          });
          try {
            const document = await analyseRedactionFile(
              entry.file,
              entry.id,
              regions ? { ...settings, ocr: false } : settings,
              ocr,
              controller.signal,
              report,
            );
            created.push(document);
            if (
              !regions &&
              !document.table &&
              settings.ner !== false &&
              settings.categories.some((category) =>
                ["name", "company", "address"].includes(category),
              )
            )
              await recognizeDocumentEntities(
                document,
                controller.signal,
                report,
              );
          } catch (error) {
            if (controller.signal.aborted) break;
            setErrors((previous) => [
              ...previous,
              {
                file: entry.file.name,
                code: error instanceof Error ? error.message : "READ_FAILED",
              },
            ]);
          }
        }
        if (generation.current !== version || controller.signal.aborted) {
          for (const document of created)
            await disposeRedactionDocument(document);
          return;
        }
        for (const old of documentsRef.current)
          await disposeRedactionDocument(old);
        setDocuments(created);
        setHits(
          regions && created[0]
            ? regions.map(({ pageIndex, rect }) => ({
                id: generateId(),
                documentId: created[0].id,
                pageIndex,
                category: "region" as const,
                original: "",
                start: -1,
                end: -1,
                rects: [rect],
                selected: true,
                review: false,
                manual: true,
              }))
            : created.flatMap((document) => findHits(document, settings)),
        );
        setHistory([]);
        setFuture([]);
      } catch {
        if (generation.current === version && !controller.signal.aborted)
          setErrors([{ file: files[0].file.name, code: "READ_FAILED" }]);
      } finally {
        try {
          await disposeOcr?.();
        } finally {
          if (generation.current === version) {
            job.current = null;
            setBusy(false);
            setProgress(null);
          }
        }
      }
    },
    [settings],
  );

  useEffect(
    () => () => {
      generation.current++;
      job.current?.abort();
      void import("@app/services/fileRedaction/documents").then(
        ({ disposeRedactionDocument }) => {
          for (const document of documentsRef.current)
            void disposeRedactionDocument(document);
        },
      );
    },
    [],
  );

  const labels = useMemo(
    () =>
      Object.fromEntries(
        [
          ...CATEGORY_GROUPS.flatMap((group) => group.categories),
          "custom",
          "region",
        ].map((category) => [category, t(`fileRedaction.aliases.${category}`)]),
      ) as Partial<Record<RedactionCategory, string>>,
    [t],
  );
  const replacements = useMemo(
    () => replacementsFor(hits, settings.method, labels),
    [hits, labels, settings.method],
  );
  const exportFiles = useCallback(
    async (ids: string[]): Promise<File[]> => {
      if (job.current) return [];
      const controller = new AbortController();
      job.current = controller;
      const version = ++generation.current;
      setBusy(true);
      setErrors([]);
      const output: File[] = [];
      try {
        const { exportRedactionDocument } =
          await import("@app/services/fileRedaction/documents");
        for (const document of documents.filter((document) =>
          ids.includes(document.id),
        )) {
          if (controller.signal.aborted) return [];
          try {
            output.push(
              await exportRedactionDocument(
                document,
                hits,
                replacements,
                settings,
                controller.signal,
                (value) => {
                  if (generation.current === version) setProgress(value);
                },
              ),
            );
          } catch (error) {
            if (controller.signal.aborted) return [];
            setErrors((previous) => [
              ...previous,
              {
                file: document.file.name,
                code: error instanceof Error ? error.message : "EXPORT_FAILED",
              },
            ]);
          }
        }
        return controller.signal.aborted ? [] : output;
      } finally {
        if (generation.current === version) {
          job.current = null;
          setBusy(false);
          setProgress(null);
        }
      }
    },
    [documents, hits, replacements, settings],
  );

  const value: RedactionSession = {
    settings,
    updateSettings,
    documents,
    hits,
    activeDocumentId,
    activePageIndex,
    focusHitId,
    preview,
    setPreview: (value) => {
      setPreview(value);
      setDrawing(false);
    },
    drawing,
    setDrawing,
    wordView,
    setWordView,
    setActiveDocument,
    setActivePage: (index) => {
      setActivePageIndex(index);
      setFocusHitId(null);
    },
    focusHit: (hit) => {
      setActiveFileId(hit.documentId);
      setActivePageIndex(hit.pageIndex);
      setFocusHitId(hit.id);
      if (documents.find((doc) => doc.id === hit.documentId)?.kind === "docx")
        setWordView("text");
      else if (!documents.find((doc) => doc.id === hit.documentId)?.table)
        scrollActions.scrollToPage(hit.pageIndex + 1, "smooth");
    },
    analyse,
    cancel,
    busy,
    progress,
    errors,
    dismissErrors: () => setErrors([]),
    redactColumn: (documentId, sheet, column, category, skipHeader) => {
      const document = documents.find((doc) => doc.id === documentId);
      const header = new Set(document?.table?.sheets[sheet]?.rows[0] ?? []);
      const pages =
        document?.pages.filter(
          (page) =>
            page.tableCell?.sheet === sheet &&
            page.tableCell.column === column &&
            page.text.trim() &&
            !(skipHeader && header.has(page.index)),
        ) ?? [];
      const changedPages = new Set(pages.map((page) => page.index));
      const additions: RedactionHit[] = pages.map((page) => {
        const start = page.text.length - page.text.trimStart().length;
        const end = page.text.trimEnd().length;
        return {
          id: `${documentId}:${page.index}:${start}:${end}`,
          documentId,
          pageIndex: page.index,
          category,
          original: page.text.slice(start, end),
          start,
          end,
          rects: [],
          selected: true,
          review: false,
          manual: true,
          source: "manual",
        };
      });
      if (additions.length)
        edit([
          ...hits.filter(
            (hit) =>
              !(
                hit.documentId === documentId && changedPages.has(hit.pageIndex)
              ),
          ),
          ...additions,
        ]);
    },
    replacements,
    exportFiles,
    changeHits: (ids, patch) =>
      edit(
        hits.map((hit) => (ids.includes(hit.id) ? { ...hit, ...patch } : hit)),
      ),
    addSearch: (value) => {
      const additions = documents
        .flatMap((document) => findHits(document, settings, value.trim()))
        .filter(
          (hit) =>
            !hits.some(
              (existing) =>
                existing.documentId === hit.documentId &&
                existing.pageIndex === hit.pageIndex &&
                existing.start < hit.end &&
                existing.end > hit.start,
            ),
        );
      if (additions.length) edit([...hits, ...additions]);
      return additions.length;
    },
    addRegion: (rect, pageIndex = activePageIndex) => {
      if (!activeDocumentId || rect.width < 2 || rect.height < 2) return;
      edit([
        ...hits,
        {
          id: generateId(),
          documentId: activeDocumentId,
          pageIndex,
          category: "region",
          original: "",
          start: -1,
          end: -1,
          rects: [rect],
          selected: true,
          review: false,
        },
      ]);
    },
    undo: () => {
      if (!history.length) return;
      setFuture((previous) => [hits, ...previous]);
      setHits(history.at(-1)!);
      setHistory((previous) => previous.slice(0, -1));
    },
    redo: () => {
      if (!future.length) return;
      setHistory((previous) => [...previous, hits]);
      setHits(future[0]);
      setFuture((previous) => previous.slice(1));
    },
    canUndo: history.length > 0,
    canRedo: future.length > 0,
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useFileRedaction(): RedactionSession {
  const value = useContext(Context);
  if (!value) throw new Error("FileRedactionProvider is required");
  return value;
}

export function useOptionalFileRedaction(): RedactionSession | null {
  return useContext(Context);
}
