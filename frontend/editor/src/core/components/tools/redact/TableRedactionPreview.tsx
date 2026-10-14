import { useEffect, useMemo, useRef, useState } from "react";
import { Checkbox, Select } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useFileRedaction } from "@app/contexts/FileRedactionContext";
import type {
  RedactionCategory,
  RedactionDocument,
} from "@app/types/fileRedaction";
import {
  CATEGORY_GROUPS,
  replaceRanges,
} from "@app/services/fileRedaction/rules";
import { columnLabel } from "@app/services/fileRedaction/table";
import { Button } from "@app/ui/Button";

const ROWS_PER_PAGE = 50;

export default function TableRedactionPreview({
  document,
  readOnly = false,
}: {
  document: RedactionDocument;
  readOnly?: boolean;
}) {
  const { t } = useTranslation();
  const session = useFileRedaction();
  const [sheetIndex, setSheetIndex] = useState(0);
  const [offset, setOffset] = useState(0);
  const [column, setColumn] = useState<string | null>("0");
  const [category, setCategory] = useState<string | null>("name");
  const sheet = document.table!.sheets[sheetIndex];
  const [skipHeader, setSkipHeader] = useState(sheet.header);
  const table = useRef<HTMLDivElement>(null);
  const byPage = useMemo(() => {
    const grouped = new Map<number, typeof session.hits>();
    for (const hit of session.hits.filter(
      (hit) => !readOnly && hit.documentId === document.id,
    ))
      grouped.set(hit.pageIndex, [...(grouped.get(hit.pageIndex) ?? []), hit]);
    return grouped;
  }, [session.hits, document.id, readOnly]);
  const columnCount = Math.max(0, ...sheet.rows.map((row) => row.length));
  useEffect(() => {
    if (readOnly || !session.focusHitId) return;
    const hit = session.hits.find((hit) => hit.id === session.focusHitId);
    const cell = document.pages.find(
      (page) => page.index === hit?.pageIndex,
    )?.tableCell;
    if (!cell) return;
    setSheetIndex(cell.sheet);
    const rows = document.table!.sheets[cell.sheet].rows;
    const rowIndex = rows.findIndex((row) => row.includes(hit!.pageIndex));
    setOffset(
      Math.max(0, Math.floor(rowIndex / ROWS_PER_PAGE) * ROWS_PER_PAGE),
    );
  }, [session.focusHitId, session.hits, document, readOnly]);
  useEffect(() => {
    table.current
      ?.querySelector('[data-focused="true"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [sheetIndex, offset, session.focusHitId]);
  if (!sheet) return null;
  return (
    <section
      className="file-redaction-table-preview"
      aria-label={
        readOnly
          ? sheet.name
          : t("fileRedaction.table.preview", "Table redaction preview")
      }
    >
      <div className="file-redaction-table-toolbar">
        <Select
          label={t("fileRedaction.table.sheet", "Worksheet")}
          value={String(sheetIndex)}
          data={document.table!.sheets.map((sheet, index) => ({
            value: String(index),
            label:
              sheet.name +
              (sheet.hidden
                ? ` (${t("fileRedaction.table.hidden", "hidden")})`
                : ""),
          }))}
          onChange={(value) => {
            if (value !== null) {
              const index = Number(value);
              setSheetIndex(index);
              setOffset(0);
              setSkipHeader(document.table!.sheets[index].header);
              setColumn("0");
            }
          }}
        />
        {!readOnly && (
          <>
            <Select
              label={t("fileRedaction.table.column", "Column")}
              value={column}
              data={Array.from({ length: columnCount }, (_, index) => ({
                value: String(index),
                label: `${columnLabel(index)}${skipHeader && sheet.rows[0]?.[index] >= 0 ? ` · ${document.pages[sheet.rows[0][index]].text.slice(0, 32)}` : ""}`,
              }))}
              onChange={setColumn}
            />
            <Select
              label={t("fileRedaction.table.category", "Treat column as")}
              value={category}
              data={CATEGORY_GROUPS.flatMap((group) => group.categories)
                .filter((value) => value !== "region")
                .map((value) => ({
                  value,
                  label: t(`fileRedaction.categories.${value}`),
                }))}
              onChange={setCategory}
            />
            <Button
              disabled={column === null || category === null || session.busy}
              onClick={() =>
                session.redactColumn(
                  document.id,
                  sheetIndex,
                  Number(column),
                  category as RedactionCategory,
                  skipHeader,
                )
              }
            >
              {t("fileRedaction.table.apply", "Redact column")}
            </Button>
            <Checkbox
              checked={skipHeader}
              onChange={(event) => setSkipHeader(event.currentTarget.checked)}
              label={t("fileRedaction.table.header", "Skip first row (header)")}
            />
          </>
        )}
      </div>
      {!readOnly && (
        <p className="file-redaction-note">
          {t(
            "fileRedaction.table.help",
            "Review cell content, or apply a category to a whole column. Export replaces the actual values.",
          )}
        </p>
      )}
      <div className="file-redaction-table-scroll" ref={table}>
        <table>
          <caption>{sheet.name}</caption>
          <thead>
            <tr>
              <th scope="col">#</th>
              {Array.from({ length: columnCount }, (_, index) => (
                <th scope="col" key={index}>
                  {columnLabel(index)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sheet.rows
              .slice(offset, offset + ROWS_PER_PAGE)
              .map((row, rowIndex) => (
                <tr key={offset + rowIndex}>
                  <th scope="row">
                    {(document.pages[row.find((index) => index >= 0) ?? -1]
                      ?.tableCell?.row ?? offset + rowIndex) + 1}
                  </th>
                  {Array.from({ length: columnCount }, (_, col) => {
                    const page = document.pages[row[col]];
                    const hits = page ? (byPage.get(page.index) ?? []) : [];
                    const focused = hits.some(
                      (hit) => hit.id === session.focusHitId,
                    );
                    const selected = hits.some((hit) => hit.selected);
                    const text = page
                      ? session.preview
                        ? replaceRanges(
                            page.text,
                            hits,
                            session.replacements,
                            session.settings.method === "blackout",
                          )
                        : page.text
                      : "";
                    return (
                      <td
                        key={col}
                        data-focused={focused}
                        className={selected ? "has-redaction" : undefined}
                      >
                        {hits.length ? (
                          <button
                            type="button"
                            aria-pressed={selected}
                            title={t(
                              "fileRedaction.table.toggle",
                              "Toggle redaction for this cell",
                            )}
                            onClick={() =>
                              session.changeHits(
                                hits.map((hit) => hit.id),
                                { selected: !selected },
                              )
                            }
                          >
                            {text || "\u00A0"}
                          </button>
                        ) : (
                          text
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <div className="file-redaction-table-pagination">
        <Button
          variant="tertiary"
          disabled={offset === 0}
          onClick={() => setOffset(Math.max(0, offset - ROWS_PER_PAGE))}
        >
          {t("fileRedaction.table.previous", "Previous rows")}
        </Button>
        <span aria-live="polite">
          {Math.min(offset + 1, sheet.rows.length)}–
          {Math.min(offset + ROWS_PER_PAGE, sheet.rows.length)} /{" "}
          {sheet.rows.length}
        </span>
        <Button
          variant="tertiary"
          disabled={offset + ROWS_PER_PAGE >= sheet.rows.length}
          onClick={() => setOffset(offset + ROWS_PER_PAGE)}
        >
          {t("fileRedaction.table.next", "Next rows")}
        </Button>
      </div>
    </section>
  );
}
