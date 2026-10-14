# Table redaction — scoped extension

## Authority and scope

The user approved a lightweight implementation of Word, Excel and CSV redaction. DOCX already uses the existing document redaction path. This extension adds ordinary XLSX data tables and CSV to the same file selection, settings, review, history and export workflow. Desktop acceptance remains authorized; no small-screen acceptance is claimed.

This is an extension of the established tool inspector. It preserves the app frame, three workbench modes, sidebar, redaction settings/results/search tabs and semantic theme tokens. The new table surface uses the existing Mantine controls and @app/ui/Button rather than introducing a design system or spreadsheet editor.

## Behavior and source map

- `services/fileRedaction/table.ts`: XLSX package parsing through existing JSZip; CSV parsing through lazy-loaded Papa Parse. Cell values remain strings. XLSX sheets include hidden sheets. Header labels provide whole-cell candidates; the existing rules, dictionaries, exclusions, selected hits and replacement methods remain authoritative.
- `contexts/FileRedactionContext.tsx`: manual whole-column redaction, optional first-row exclusion, undo/redo, table hit focus, and bypass of per-cell Chinese-model calls.
- `components/tools/redact/TableRedactionPreview.tsx`: sheet and column selection, column category, a 50-row paged table, per-cell selection toggles and preview. The preview is keyed by document id so switching documents resets sheet-specific state.
- `components/tools/redact/FileRedactionPanel.tsx`: unsupported-file errors remain visible even when analysis yields no documents.
- `services/fileRedaction/documents.ts` and `components/tools/redact/NonPdfRedactionPreview.tsx`: dynamic table imports preserve the existing PDF/DOCX/image paths. `vite.config.ts` pre-optimizes Papa Parse only for development to prevent a first-use dependency reload.

XLSX export replaces real cell text, retains cell style ids, row/column structure and merges, converts shared strings to inline strings, and removes the old shared-string table. It removes comments, document properties, custom XML, signatures, hyperlink relationships, named ranges and validation/cache data that could preserve values. Selected rich text is rewritten as plain text with the cell style retained; unselected rich text runs are preserved. CSV export uses UTF-8 BOM, retains detected delimiter/newline, and escapes formula-like values.

## Supported boundary

XLSX workbooks containing formulas, macros, embedded objects, images/drawings/charts, pivot or external connection data are rejected with recovery guidance. XLS and XLSM are not added. The user can paste formulas as values and save a separate XLSX copy. Import limits are 20 MiB, 50,000 cells, 256 columns and row index 20,000. Column bounds are checked before allocating sparse row slots.

The table preview displays raw cell text rather than recreating Excel's numeric/date format rendering. Native export preserves the original styles. This is a data-redaction tool, with no full spreadsheet editing or complex workbook fidelity claim.

## Acceptance evidence

- 62 related tests pass: 13 table, 10 Word, 28 rules, 7 context and 4 document tests. Includes quoted/multiline CSV, GBK decoding, long identifiers, leading zeros, hidden sheets, shared/rich strings, unsupported parts, bounds, column history and native export round trips.
- Targeted formatting, lint and stylelint pass. Required `frontend:check` passes the proprietary TypeScript phase and stops on the six existing unused declarations in AboutSection.tsx/usePosthogTracking.ts.
- Real 1280×720 desktop browser flow imported fictional CSV/XLSX fixtures, analyzed and reviewed cells, applied a whole column, undid it, switched sheets/documents and downloaded both formats. The unsupported-formula prompt was checked with no successfully analyzed documents.
- Both downloaded files were inspected: selected fixture originals absent, public content and unredacted leading-zero identifiers retained; hidden-sheet values removed. LibreOffice successfully reopened the downloaded XLSX and converted its first sheet to CSV. This is compatibility evidence for the fixture, not a claim of testing Microsoft Excel.
- Papa Parse has no runtime dependencies. Standalone minification measured 20,760 bytes / 7,512 gzip bytes, not a full application bundle measurement. XLSX reuses JSZip already present.

Evidence is saved outside the repository at `C:/Users/Vere/Downloads/Stirling-PDF-main/audit/2026-10-11/table-redaction/`, including desktop-csv-preview.jpg, actual downloads and verification.json. No production documents were used.

## Preview and OCR follow-up — 2026-10-13

Native DOCX preview now preserves its page dimensions and margins through docx-preview. Image and Word previews share display-only zoom controls; redaction coordinates retain original dimensions. Ordinary CSV/XLSX previews use the existing table parser in read-only mode; long cell values scroll horizontally and sheet headings stay visible. Complex-workbook rejection still applies to ordinary preview.

Small-text image OCR conditionally retries at a capped larger raster, keeps the original when the retry loses too much text, maps rectangles back to original image coordinates, and releases the temporary canvas. Empty recognition can retry sparse-text mode. Wrapped address continuation accepts OCR spacing without changing source offsets.

Desktop confirmation reanalyzed sparse-contact.png: its fictional name, wrapped address including room number, and phone were selected and covered in both preview and a 1000×650 export. The heading containing 信息 and public prose remained visible. Evidence is in `C:/Users/Vere/Downloads/Stirling-PDF-main/audit/2026-10-13/project-tests/`. This fixture is regression evidence, not an accuracy guarantee for arbitrary scans. The broader project test report records remaining performance, conversion, preview and quality-gate gaps.

## Preview verification — 2026-10-14

Ordinary XLSX preview accepts formulas and complex workbook parts in read-only mode. It displays saved formula results, or formula text when no result is stored; it executes no formulas and renders no charts or images. The preview-only document cannot enter native redaction export. Complex-workbook restrictions still apply to redaction; this is no claim of Excel layout fidelity.

Analyzed legacy DOC files use the PDF normalized on the local processing service for review. Multi-page legacy DOC results have previous/next controls in the right inspector, including access to pages without sensitive hits; ordinary PDFs keep their reader navigation. The inspector follows the file currently opened in the reading area. The open file takes precedence over an unrelated checked selection; an intentional checked batch remains active when it includes the open file. Importing files from the redaction inspector opens the first imported file and selects the imported batch.

Desktop fixtures confirmed a formula result of 2 in the XLSX preview and both pages of a legacy DOC, including its public second page. Evidence is in `C:/Users/Vere/Downloads/Stirling-PDF-main/audit/2026-10-14/project-fixes/`. The current repair report records full quality-gate results and the measured editor switching improvement.

## Scan targets and Word preview — 2026-10-14

The inspector lists the effective target filenames above the scan button. Analysis errors appear beside that button, remain visible when no document was analyzed, and are scoped to the effective targets. An unexpected rejected analysis promise has the same visible recovery path. OCR cleanup releases the busy state even if worker termination fails, so another scan can start.

Ordinary DOC files now receive a read-only preview before analysis. The existing local conversion service produces a temporary PDF; the existing PDFium renderer displays one page at a time with previous/next navigation and width-fitted zoom. Switching files cancels pending conversion and ignores stale render results. The original Word file remains in the library unchanged. DOCX retains its direct native document preview. Neither path adds a dependency or an editing interface.

The final frontend quality gate passed all 636 test files and 6,430 tests, including target selection, error visibility, worker cleanup retry, local conversion and preview lifecycle regressions. Desktop fixtures verified DOC and DOCX previews before analysis, 10 selected matches in each Word fixture, and 13 selected matches in the PDF fixture. The actual exported PDF contains two pages and no selectable original text; rendered inspection preserved headings and public prose. Complex XLSX restrictions still apply to redaction. Evidence and the scoped repair report are in `C:/Users/Vere/Downloads/Stirling-PDF-main/audit/2026-10-14/redaction-start-word-preview/`.

## PDF glyph bounds — 2026-10-14

PDF redaction uses tight native glyph bounds, with loose font bounds only as a fallback when tight bounds are unavailable. Same-line rectangles compare vertical centers so low punctuation and mixed Chinese/Latin text stay together. The edited Chinese-font fixture previously returned a roughly 40-unit line box around 13-unit visible text; its address frame now follows the visible glyphs. Preview and export share the coordinates, while export retains a small safety margin. Manual regions retain their exact dimensions. Geometry changes do not claim to resolve field recognition gaps; review of wrapped address continuations remains necessary. Desktop screenshots, native bounds and the actual two-page exported PDF are saved at `C:/Users/Vere/Downloads/Stirling-PDF-main/audit/2026-10-14/address-box/`.

## Word preview loading — 2026-10-14

DOC and DOCX no longer display a floating conversion button in their native read-only preview. Other supported formats keep their conversion action. A shared loading state delays visual progress by 200 milliseconds to avoid flashing during fast cached loads, then shows progress centrally. DOCX's empty zoom controls stay hidden until content is ready.

The existing preview paths share an LRU cache of at most two ready source Blobs with a 16 MiB source/content byte budget. DOCX caches a detached static layout template that is cloned for each mount; DOC caches its normalized PDF and first-page image. Changed Blob identity invalidates prior results, failures remain retryable, and late results from a switched-away file are not cached. This adds no library or editing surface. Desktop fixture measurements and the bounded regression evidence are saved at `C:/Users/Vere/Downloads/Stirling-PDF-main/audit/2026-10-14/word-preview-loading/`.
