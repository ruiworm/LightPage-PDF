# Tool actions and workbench tabs

Mode: Operate. Existing visual world and token authority: PRODUCT.md and DESIGN.md.

User direction from five annotated screenshots: place tool-library add/remove actions at the top right of each card; provide removal controls in the tool sidebar; remove the library grouping-settings button and administrator setup prompt; always show three centered workbench tabs named 阅读、整理、编辑.

The library actions share the heading row and preserve their availability, announcement and persistence behavior. Sidebar removal is a separate sibling button with a tool-specific accessible name; it does not open the tool or delete a file. The grouping extension continues to supply file groups without a settings button in the shared header. Administrator setup content is removed from both preference implementations and its unused component is deleted.

The workbench top row uses equal side columns so actions and optional return controls cannot offset the view switcher. The PDF edit tab enters the existing guarded tool workflow before initialization and reuses the ready custom view afterward. Registered PDF editor views do not produce a duplicate tab. Other custom tool views retain their existing entries.

Desktop acceptance at 1280×720: measured switcher center offset 0px; no horizontal page overflow. Tested library addition, direct sidebar removal without navigation, loaded PDF editing, return to reading and organization of the currently viewed PDF. Test additions were removed afterward, restoring eight sidebar tools and zero selected files. File contents were not edited or exported.

25 related tests, targeted lint, CSS lint and the proprietary TypeScript phase passed. Layout detector returned no findings. Required frontend:check still stops on six existing unused declarations in AboutSection/usePosthogTracking. Desktop-only acceptance persists; mobile, native title-bar alignment and dark mode were not visually accepted here.

Proof files under `C:/Users/Vere/Downloads/Stirling-PDF-main/audit/2026-10-10/tool-actions-tabs/`: library.jpg, editor-empty.jpg, editor-loaded.jpg, organize.jpg, settings.jpg.
