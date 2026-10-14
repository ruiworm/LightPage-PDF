# Tool Inspector — 已完成的共享面板扩展

## Scope and authority

- Classification: established-world extension / approved shared tool-panel system change; scan-mode documentation.
- Human direction: 工具按功能分组直接显示，呈现为“简洁的设置面板”；只验收桌面端。
- Product authority: root PRODUCT.md. Visual token authority: root DESIGN.md plus the existing implementation sources below.
- Preserve 轻页 PDF logo, top navigation, file sidebar and document preview. No new brand, display typography or palette.
- This surface brief owns the tool-panel composition. It does not require unrelated surfaces to adopt this composition.

## Implemented pattern

1. Shared quiet header: rounded square icon, compact title, trailing close action.
2. Short existing tool description.
3. File context or the tool's existing file selection area.
4. Direct named functional groups using semantic section/h3 structure. Ordinary tools use groups presentation with no wizard numerals or chevrons. Existing visibility/collapse/workflow conditions remain operative; groups are not unconditionally expanded.
5. Ordinary tool operation footer at the content bottom, separated by a fine rule. Long content scrolls within the established panel.

Tool title uses 16px/650, group names 13px/650, ordinary labels 13px, supporting copy 12px and metadata 11px at the default root size. Group/footer padding is 16px; file context padding and corner radius are 12px. These values are sourced in DESIGN.md, not a new global sizing override.

ToolInspector.css applies a 40px minimum and 12px radius to Mantine input/textarea/button roots. A minimum allows wrapped content to grow. SegmentedControl, ActionIcon, native checkboxes, switches and redaction tabs keep their existing compact sizing. ButtonSelector delegates to the existing SegmentedControl, including disabled options and labels.

Redaction uses the shared header/description and control styling while preserving its settings/results/search tabs. FileRedactionActions appears only after analysis has produced documents. Preview, result review, drawing, history, export and search behavior remain governed by their existing components; redaction does not adopt the ordinary tool execution footer.

## Source map

| Responsibility | Source under frontend/editor/src/core |
| --- | --- |
| Raw palette | theme/primitives.css |
| Semantic color mapping and default neutral surfaces | theme/colors.css |
| Spacing, radius, font and motion tokens | theme/dimensions.css |
| Mantine palette/field/button wiring | theme/mantineTheme.ts |
| Theme state and imports | components/shared/ThemeProvider.tsx |
| Shared SUI status, shadow and reduced-motion definitions | tokens/tokens.css, tokens/base.css, tokens/tokens.ts |
| Tool boundary and group presentation | components/tools/ToolRenderer.tsx, components/tools/ToolInspector.css, components/tools/shared/ToolStep.tsx |
| Title pattern | components/shared/ToolPanelHeader.tsx, ToolPanelHeader.css |
| Choice pattern | components/shared/ButtonSelector.tsx, ui/SegmentedControl.tsx, SegmentedControl.css |
| Actions and sizing | ui/Button.tsx, Button.css, ActionIcon.tsx, ActionIcon.css, accents.css, controlSizes.ts |
| Ordinary execution footer | components/tools/shared/createToolFlow.module.css, OperationButton.tsx |
| Navigation and frame | components/shared/quickNav/AppNavigationBar.css, components/layout/AppFrame.css |
| Redaction exception | components/tools/redact/FileRedactionPanel.tsx, FileRedactionActions.tsx, FileRedaction.css |
| Incumbent canonical examples | ui/Input.tsx/.css, Chip.tsx/.css, Card.tsx/.css, Surface.css |
| Global inherited type and legacy shadows | styles/index.css, styles/theme.css |

Sidecar snippets translate these existing components to self-contained HTML/CSS with live semantic CSS variables; they require no React or Tailwind runtime. Mantine's installed styles supply inherited button padding, focus/active behavior and Pill shape. Tonal strips reuse the existing primary and neutral palette families; no generated palette primitives are introduced. They are palette-family references, not a new interpolation of every named surface.

## Acceptance evidence and limits

Visually checked four actual 1280×720 desktop screenshots:

- [desktop.jpg](../review/tool-ui/desktop.jpg): ordinary compression tool, file context, settings and footer.
- [merge-empty.jpg](../review/tool-ui/merge-empty.jpg): multi-file empty/disabled state and ordering controls.
- [redact.jpg](../review/tool-ui/redact.jpg): initial redaction settings and tabs; pre-analysis result actions are hidden.
- [redact-results.jpg](../review/tool-ui/redact-results.jpg): result review, preview and export affordances.

The shipped desktop reviewer disposition supplied to this handoff is **ship**, with no material fixes. Supplied verification: 48 related tests pass; targeted lint and formatting pass. Required frontend:check passes the proprietary TypeScript phase and then stops on six pre-existing unrelated unused-code errors in AboutSection/usePosthogTracking. Those tests were not rerun for this documentation-only handoff.

The browser viewport API did not actually resize the captured surface. Human acceptance was explicitly desktop-only. There is no mobile, 1480px, dark-mode, export-execution or cross-viewport validation claim.

## Existing drift not adopted or repaired

- theme/README.md describes editable accent settings that differ from the current fixed-default ThemeProvider implementation.
- styles/theme.css and tokens/tokens.css retain different definitions of --shadow-*; no single global shadow vocabulary is inferred from them.
- Global body, Mantine and the shared --font-sans token have separate incumbent font mappings. mantineTheme.ts also retains literal dark palette values. These are outside the approved tool-panel refinement and are not new system invariants.

PRODUCT.md and all UI source remain outside this documentation write boundary.
