# Settings page — 单栏设置

## Scope

User direction: 删除左侧设置导航，将右侧设置融合在一起，去掉外观、阅读设置、下载等分类容器。
This is an incumbent-world refinement using PRODUCT.md, DESIGN.md and existing semantic tokens; no new brand or palette.

## Composition and behavior

- Shared app header remains above one centered, scrollable content pane.
- One “设置” page title and one continuous panel. Language, reader zoom and download controls use rows with fine separators.
- Shortcut search and rebinding rows are directly visible in the same panel; no category accordions or nested cards.
- Preference persistence, download limit validation, shortcut capture/cancellation and the unsaved-navigation guard remain in their existing implementations.
- Existing section/setting anchors and the retired `/settings/hotkeys` alias remain available.
- Shortcut settings and dispatch share the visible, openable tool list. Hidden entries and pipeline placeholders have no shortcuts; their stored bindings are pruned and no longer reserve key combinations. Tools temporarily unavailable because of missing processing dependencies remain configurable.

## Verification

Desktop only, as previously accepted by the user. Actual browser capture: 1280×720; panel width 848px, no horizontal overflow, no settings rail or preference category accordions.
Reader zoom menu, shortcut filtering/empty results, capture cancellation and the old shortcut link were exercised. No saved user preference was changed.
13 existing preference/search/target tests, targeted lint, CSS lint and the proprietary TypeScript phase passed.
Required frontend:check stops on six pre-existing unused declarations in AboutSection/usePosthogTracking. The browser also retains its existing React script-tag warning; neither issue was changed in this layout task.

Evidence: `C:/Users/Vere/Downloads/Stirling-PDF-main/audit/2026-10-10/settings-unified/desktop.jpg`.
No mobile, dark-mode or cross-browser acceptance is claimed.

Shortcut cleanup verification: 28 current tools remain; 34 hidden entries are excluded. Existing Ctrl+Alt+1–8 defaults are unchanged. Seven shortcut regressions plus 15 library/preference tests pass; targeted lint and proprietary type checking pass. The required full check retains the same six existing unused-declaration errors. Desktop evidence: `C:/Users/Vere/Downloads/Stirling-PDF-main/audit/2026-10-10/shortcuts-folder-badge/settings.jpg` and `verification.json`.
