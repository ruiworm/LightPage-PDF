# Workbench switching

Mode: Operate. Preserve PRODUCT.md / DESIGN.md and the centered 阅读、整理、编辑 switcher. Desktop acceptance remains the user-approved scope.

Request: reduce stuttering between the three document views and remove the confusing, inactive reader rail when no document is open.

Measured baseline: the regression harness cycled through all three views three times. Reading initialized once; organizing and editing initialized three times each. The page context also discarded the persisted document solely on leaving/re-entering its tab.

Now visited page and text canvases stay mounted within the workspace. Only the PDF editor controller is retained in the tool panel; other tools retain their previous lifetime. A controller can mount hidden to register its canvas before activation. Hidden views are inert, unregister workbench actions and navigation handlers, stop global editor shortcuts/clipboard handling, and pause the page thumbnail queue. File selection and source changes still invalidate page state. Editor re-entry follows a newly opened reader PDF only when edits are clean. Closing a source frees its editor document and invalidates pending loads. Store owners are counted so removing either the inspector or canvas cannot dispose a document still used by the other.

Replacement QA exposed old page effects touching a disposed native document when moving from a two-page PDF to a one-page PDF. The editor hook now reads the current external-store snapshot; page keys include the native document identity, and old effects check disposal before accessing it.

Discard remains explicit: navigation prompts are preserved, page edits rebuild from their source and clear history; text discard clears the working document. Hidden modal portals do not appear over another tab. The empty reader renders no rail; Add file remains on the landing page and document controls return after opening a file.

After: the same harness initializes each view once. 58 related tests passed across 10 files, including controller retention, snapshot freshness, resource ownership/release, hidden shortcuts, source replacement, page-cache invalidation and paused thumbnail loading. Targeted lint and proprietary type checking passed. Required frontend:check reaches lint and still stops on six pre-existing unused declarations in AboutSection/usePosthogTracking.

Desktop browser confirmation at 1280×720: three consecutive tab cycles showed no repeated parsing progress or error; one-page/two-page PDF switches updated the editor content correctly; rotate → leave → discard → return restored rotate(0deg) and cleared Undo. Source files were neither saved nor exported. The QA-opened workbench files were closed afterward and the temporary tab was removed. No horizontal overflow. First open/new file still performs necessary parsing; no INP or low-end device timing claim is made.

Proof: C:/Users/Vere/Downloads/Stirling-PDF-main/audit/2026-10-10/workbench-switching/editor.jpg, reader-empty.jpg, switches.json.

## Warm click latency follow-up

The user clarified that every click still pauses after all views have opened. Retention alone did not address input-to-commit cost. Temporary layout-effect timers and React profilers showed all retained canvases refreshing on toolbar/navigation broadcasts, plus a second commit to pin the editor after tool selection.

Navigation actions now keep stable identities while checking the latest state and registry. Tool selection and guard state have narrower subscriptions; unchanged reducer values do not republish context. Toolbar registration has an action-only context. The viewer no longer subscribes to unused navigation state. Canvas boundaries and the page grid are memoized; hidden retained containers skip layout/paint. Tool-workflow callbacks also keep stable identities. Registered text editors select their tool and canvas together after availability, preview-import, and unsaved-work checks. Returning to organizing retains the editor tool/session, changes the panel to its picker, and avoids another address rewrite. Editing restores its inspector in the same update. Reading shows the tool picker while the editor inspector is inactive. Other tool selection still uses the guarded workflow.

Diagnostic samples: same synthetic two-page PDF, Vite development server, background Codex browser, three warm cycles (nine clicks). Handler-to-layout-effect commit mean was about 435 ms before and 267 ms after; median editing sample was 550 ms before and 231 ms after. There are outliers and fewer gains in organizing. These are development diagnostics, not foreground INP or a promise of instant switching; baseline includes profiling overhead. Background double-animation-frame timings were excluded due to throttling. All temporary timing/profiler code was removed.

74 related tests passed across the existing 13 files (the toolbar fixture repair was rerun separately). Added checks cover stable subscriptions, current dirty-state guards through previously obtained callbacks, atomic reopening, preview promotion, availability, session reuse, inspector restoration, and paused-controller/picker behavior. Modified-file lint passed. Proprietary type checking passed; required frontend:check still stops on the same six existing unused declarations in AboutSection/usePosthogTracking.

Desktop browser checks confirmed a new one-page reader PDF replaces the editor content, rotate → switch → warning → discard succeeds, Undo clears, and the original pages return upright. No source was saved/exported. QA tabs were closed and the file selection restored to zero. Final screenshots and all intermediate diagnostic samples are saved under C:/Users/Vere/Downloads/Stirling-PDF-main/audit/2026-10-10/workbench-click-latency/.

## Compact desktop workspace, 2026-10-18

At widths up to 1024 px, the document stays in the main workbench. Folder and tool buttons occupy the existing centered view switcher row; the separate Tools/Workspace slider row is removed. Side panels open over the canvas, close through their close button, Escape or backdrop, and return focus to their entry. A file change closes the folder panel. Document and panel owners remain mounted through resizing, with focus trapping active only while a compact panel is visible on the active page. Wide windows retain the existing three-column layout.

The PDF text editor uses its phone takeover only up to 768 px, so an 850 px desktop window retains Reading/Organizing/Editing and both panel entries. Native toolbar overflow and the inspector remain available in the compact desktop layout. Browser verification used a synthetic resume PDF: edit its heading without saving, resize from 850 to 1280 and back, verify the edited heading, source filename and inspector survive, then undo the temporary edit. At 850 px the view row is 44 px high and the document has no horizontal page overflow. Folder contents remain accessible in the compact panel. Proof: `audit/2026-10-17/compact-workspace-850.png`, `compact-files-850.png`, `compact-tools-850.png`.
