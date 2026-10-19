---
name: "轻页 PDF"
description: "以现有编辑器为基础的简洁设置面板视觉系统"
colors:
  primary: "#3b82f6"
  accent-text: "#1d4ed8"
  primary-subtle: "color-mix(in srgb, var(--c-primary) 14%, transparent)"
  operation-charcoal: "#373530"
  operation-inverse: "#fafafa"
  canvas-paper: "#ffffff"
  panel-white: "#ffffff"
  surface-snow: "#fafafa"
  recess-neutral: "#f0f0f0"
  text-ink: "#373530"
  text-muted: "#4b5563"
  text-subtle: "#5d636d"
  border-subtle: "#e5e7eb"
  border-strong: "#9ca3af"
  hover-neutral: "#f9fafb"
typography:
  sans-token:
    fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif'
  mono-token:
    fontFamily: '"SF Mono", "Fira Code", Menlo, Consolas, "DejaVu Sans Mono", monospace'
  title:
    fontSize: "1rem"
    fontWeight: 650
    lineHeight: 1.4
  group:
    fontSize: "0.8125rem"
    fontWeight: 650
    lineHeight: 1.5
  body:
    fontSize: "0.8125rem"
  label:
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.5
  supporting:
    fontSize: "0.75rem"
    lineHeight: 1.6
  metadata:
    fontSize: "0.6875rem"
  navigation:
    fontSize: "0.875rem"
    fontWeight: 500
rounded:
  xs: "2px"
  sm: "4px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  nav: "0.625rem"
  pill: "9999px"
spacing:
  space-0: 0
  space-0_5: "0.125rem"
  space-1: "0.25rem"
  space-1_5: "0.375rem"
  space-2: "0.5rem"
  space-3: "0.75rem"
  space-4: "1rem"
  space-5: "1.25rem"
  space-6: "1.5rem"
  space-8: "2rem"
components:
  button-primary:
    backgroundColor: "{colors.operation-charcoal}"
    textColor: "{colors.operation-inverse}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    height: "2.5rem"
  button-primary-hover:
    backgroundColor: "color-mix(in srgb, var(--c-btn-solid) 85%, var(--c-btn-inverse))"
  button-secondary:
    backgroundColor: "{colors.panel-white}"
    textColor: "{colors.operation-charcoal}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    height: "2.5rem"
  button-tertiary:
    backgroundColor: "transparent"
    textColor: "{colors.text-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    height: "2.5rem"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.accent-text}"
  tool-input:
    backgroundColor: "{colors.panel-white}"
    textColor: "{colors.text-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    height: "2.5rem"
  navigation-view:
    backgroundColor: "transparent"
    textColor: "{colors.text-muted}"
    typography: "{typography.navigation}"
    rounded: "{rounded.md}"
    padding: "0.375rem 1rem"
  chip-secondary:
    backgroundColor: "color-mix(in srgb, var(--c-primary) 12%, transparent)"
    textColor: "{colors.accent-text}"
  card:
    backgroundColor: "{colors.surface-snow}"
    textColor: "{colors.text-ink}"
    rounded: "{rounded.nav}"
    padding: "1.125rem 1.25rem"
  tool-header:
    backgroundColor: "{colors.panel-white}"
    textColor: "{colors.text-ink}"
    typography: "{typography.title}"
    padding: "{spacing.space-4}"
  tool-file-context:
    backgroundColor: "{colors.panel-white}"
    textColor: "{colors.text-ink}"
    rounded: "{rounded.lg}"
    padding: "{spacing.space-3}"
  tool-group:
    backgroundColor: "{colors.panel-white}"
    textColor: "{colors.text-ink}"
    typography: "{typography.group}"
    padding: "{spacing.space-4}"
---

# Design System: 轻页 PDF

## Overview

**Creative North Star: "简洁的设置面板"**

这是已有编辑器视觉系统的延伸。界面以安静的中性色面、清楚的文字层级和克制的状态提示承载文件操作。保留轻页 PDF 名称、标志、顶部导航、文件栏及文档预览所形成的既有视觉关系。

本次系统记录覆盖编辑器的共享视觉基础与已完成的工具检查面板。功能分组、文件上下文和操作区的具体组合见 [.impeccable/surfaces/tool-inspector.md](.impeccable/surfaces/tool-inspector.md)；它们不要求其他产品区域使用同一页面构图。

**Key Characteristics:**

- 中性色面承载工作内容，蓝色提示选择、焦点和链接。
- 深色主操作、轻量辅助操作，保持执行层级清楚。
- 紧凑文字和柔和圆角适合持续操作的编辑器。
- 工具设置按功能直接分组，文档预览保持可见。

此记录为 scan 模式的已实现系统提取，不是新品牌种子。前置人类确认见 PRODUCT.md；本次验收只覆盖桌面端。

## Colors

### Primary

选择蓝对应 `primary`，深蓝文字对应 `accent-text`。前者用于焦点边框、选中标记和原生控件强调；后者用于蓝色链接和浅色面上的强调文字。浅蓝状态面保留源代码的 `color-mix()` 表达式。

### Neutral

深色操作底与正文墨色、纸色画布、白色工具面板、雪白通用表面、浅灰凹面组成主要层级。辅助文字、细边框和悬停背景沿用既有语义色。这里不新增第二或第三品牌强调色；已有状态色和其他区域的功能色继续由各自源文件管理。

Frontmatter 记录默认浅色语义映射的精确值。实际组件必须使用 CSS 语义变量，让现有主题映射继续生效；frontmatter 不替代运行时样式源。

| Frontmatter token | Runtime source mapping |
| --- | --- |
| `primary` | `--c-primary → --p-blue-500` |
| `accent-text` | `--c-accent-text → --p-blue-700` in light mode |
| `primary-subtle` | `--c-primary-subtle` in custom/default mode |
| `operation-charcoal`, `text-ink` | `--c-btn-solid → --c-text → --p-ink` |
| `operation-inverse` | `--c-btn-inverse → --p-snow` |
| `canvas-paper` | `--c-bg → --p-white` in light mode |
| `panel-white` | `--c-bg-raised`, `--c-surface-raised`, `--c-input-bg → --p-white` |
| `surface-snow` | `--c-surface → --p-snow` |
| `recess-neutral` | `--c-surface-sunken`, `--c-border → --p-c-f0f0f0` |
| `text-muted`, `text-subtle` | `--c-text-muted → --p-gray-600`; `--c-text-subtle → --p-gray-550` |
| `border-subtle`, `border-strong` | `--c-border-subtle → --p-gray-200`; `--c-border-strong → --p-gray-400` |
| `hover-neutral` | `--c-hover → --p-gray-50` |

Palette authority is `frontend/editor/src/core/theme/primitives.css`; semantic roles are in `colors.css`. `ThemeProvider.tsx` sets `data-app-theme="custom"` and `data-accent="default"`, with the resolved light/dark scheme. Existing dark mappings remain source facts, not a claim that dark mode was visually accepted in this pass.

**The Semantic Color Rule.** 消费组件使用现有语义变量；新增颜色须先进入 primitives.css，再建立所需语义映射。

## Typography

工具面板继承现有应用和 Mantine 字体。Frontmatter 的 `sans-token` 与 `mono-token` 提取自 dimensions.css，供实际使用这些变量的共享组件参考；它们不是将整个编辑器字体重新统一的指令。全局 body 仍保留 styles/index.css 的系统字体栈，Mantine 控件保留自身的现有字体映射。

### Hierarchy

- **Title:** 工具名称，紧凑且明确，来自 ToolPanelHeader.css。
- **Group:** 功能分组名称，来自 ToolInspector.css。
- **Body / Label:** 字段、文件名称及选项文字；普通复选、单选和开关标签保留继承字重，输入字段标题使用 label 字重。
- **Supporting:** 帮助说明使用 supporting；顶部短描述在同一字号上采用源文件的行高（1.65）。
- **Metadata:** 文件大小、执行范围等较弱信息；文件元信息使用等宽数字。
- **Navigation:** 顶部入口继承现有导航字号和中等字重。

尺寸和字重以 frontmatter 为准（默认根字号下依次为 16 / 13 / 12 / 11px）。本面板没有展示型标题；不新增宣传式大字或装饰性字体。共享中等与半粗字重来源是 dimensions.css，工具标题及分组的特定字重来自对应工具样式。

## Layout

编辑器保留顶部导航、左侧文件上下文、中间文档预览和右侧工具区域的关系。顶部导航用等宽外侧列将入口组相对整个窗口居中；AppFrame.css 的桌面导航高度为 3.5rem。

通用间距来自 dimensions.css 的现有数字刻度。工具分组与操作页脚使用 `space-4`，文件信息块使用 `space-3`；分组内部间隔保留 ToolInspector.css 的局部值（0.875rem），不将其补成新的全局刻度。

工具内容为纵向流，允许内部滚动；普通工具的执行区借助 sticky 底部布局和自动上边距保持在内容底部。长文件名与范围说明允许换行。

源码含窄屏规则：导航及工具输入在 48rem 以下调整，顶部入口在 23rem 以下进一步收紧。这是已存在的实现事实；此次桌面验收没有证明移动端、其他窗口尺寸或暗色布局质量。

## Elevation & Depth

工具面板通过白色抬升面、浅灰凹面、细分隔线和控件状态区分层级，常态分组不增加阴影。共享 Surface.css 的可选 raised 表面使用现有轻柔阴影；通用卡片仍支持边框增强和轻微悬停位移。阴影与动效的完整值放在 sidecar，避免增加不受 frontmatter 支持的 token 组。

`--shadow-*` 在 legacy editor 样式和 SUI tokens 中存在不同定义，因此此记录不把其中一套升格为全产品唯一阴影刻度。工具面板采用当前明确的无组阴影规则。

**The Quiet Panel Rule.** 工具分组以间距、文字和细分隔线建立层级；需要 raised 表面时复用已有组件的层级样式。

## Shapes

柔和矩形来自现有圆角刻度。工具输入、按钮和文件上下文使用 `lg`；通用输入及导航入口仍使用 `md`；通用卡片使用 `nav`。工具标题图标也是安静的圆角方块。圆形关闭控件、胶囊标签和小复选框继续使用各自组件形状，不能将工具圆角覆盖到所有组件。

## Components

### Buttons

主操作使用 operation 底色与 inverse 标签；辅助按钮保留表面底色及细边框，tertiary 使用透明底与中性悬停，quiet 保留文字级强调。具体 variant/accent 映射来源为 Button.tsx 与 accents.css，不能从 variant 名称推断主按钮必须是蓝色。

工具面板的 Mantine 按钮根节点具有最小高度（2.5rem），标签可换行，高度可增长；frontmatter 的 height 表达这个可见基准，不是最大高度。输入、文本域也采用同一最小高度。图标按钮、分段选择、复选框和脱敏页签保留自身的紧凑尺寸。

### Chips

已有 Chip 提供实色、轻色、虚线及可移除变体。默认 secondary 使用浅色状态底、强调文字和边框；只在信息需要标签表达时复用，不为工具分组新增标签。交互标签必须保留键盘激活和已有移除行为。

### Cards / Containers

通用 Card 使用现有 Surface 底色、细边框及圆角，支持已存在的 padding 变体；装饰条和交互悬停仅用于本来采用这些变体的表面。工具分组自身保持平整，不强制改成通用卡片。文件信息块使用浅色输入面、细边框及更紧凑的内边距。

### Inputs / Fields

工具里的 Mantine 输入和文本域使用 input 背景、subtle 边框及蓝色焦点边框，支持文字选择和原生输入光标。标签、说明及错误/禁用语义由现有字段组件负责。通用 SUI Input 的默认圆角和尺寸仍按 Input.css，不能把工具选择器写成全局输入规则。

### Navigation

保留原有标志，“我的文件”和“编辑器”两个主入口居中；工具库移到右上角，只显示图标，通过提示说明用途，与外观、设置并排，点击打开完整工具库页面。常用工具在右侧以图标和文字列表排列，选择后在同一面板显示设置。左侧上方最近项目默认三条、展开最多五条，下方文件夹只展开当前项；文件夹入口默认显示五项和当前项，其余折叠。当前入口使用浅蓝选择底，悬停使用中性面，键盘焦点使用现有蓝色轮廓。导航具体尺寸和响应式行为来自 AppNavigationBar.css，不受工具面板的控件尺寸覆盖。

### Tool Inspector

共享 header 为安静的图标方块、工具名及关闭操作；随后是短描述、文件上下文和具名功能组。组使用语义 section 与 h3；无数字的分组展示由 ToolStepProvider 的 groups 模式提供。工作流差异、脱敏页签及验收证据详见工具 surface brief。

## Do's and Don'ts

### Do:

- **Do** 使用现有语义颜色变量，并把新 palette literal 留在 primitives.css。
- **Do** 保留轻页 PDF 名称、标志及编辑器既有导航与预览关系。
- **Do** 在工具检查面板复用本记录的文字层级、控件形状与分组内边距。
- **Do** 保留长文字换行、可见焦点、工具校验与结果操作状态。

### Don't:

- **Don't** 为本次工具面板新增品牌配色、宣传式大标题或装饰性视觉材料。
- **Don't** 将工具分组构图或控件最小高度机械覆盖到导航、图标按钮与其他产品区域。
- **Don't** 从桌面截图推断移动端、暗色模式或导出执行已完成验收。
- **Don't** 将 legacy 字体、阴影或主题说明的差异当作这次系统扩展的新规则。
