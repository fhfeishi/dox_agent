# dox_agent 前端设计约定（DESIGN.md）

> Agent 改 UI 前必读。唯一入口 skill：`.agents/skills/dox-ui`。  
> 本文从现有 `globals.css` / `ui.tsx` 抽出，**不是**新设计系统。

本文只管视觉与交互（token、组件复用、交互层级、动效、禁令）；产品目标、证明物与文案语气由需求载体决定，不在本文。

## 栈（不要换）

- React 19 + Vite + TypeScript + Tailwind CSS v4
- **无** shadcn / Radix；基础件在 `frontend/src/components/ui.tsx`
- Token 在 `frontend/src/styles/globals.css`（CSS 变量）

## 现有组件（优先复用）

- `TONE_BG`
- `Pill`
- `Button`
- `ToolButton`
- `VDivider`
- `PanelRow`
- `GroupLabel`
- `SearchField`
- `Card`

Tone 联合类型：`"mint" | "peach" | "lav" | "sky" | "rose" | "gray" | "yellow"`

按钮等变体以 `ui.tsx` 源码为准；新增视觉优先加变体，不新开平行组件文件。

## Token（常用变量名）

改颜色 / 间距 / 圆角时用这些 `--*` 变量，禁止随手写 hex 或不在主题里的间距：

- `--danger-bg`
- `--danger-fg`
- `--info-fg`
- `--lav-bg`
- `--lav-fg`
- `--muted`
- `--muted-cool`
- `--muted-cool-soft`
- `--ok-bg`
- `--ok-fg`
- `--orange-fg`
- `--primary`
- `--primary-pressed`
- `--primary-soft`
- `--primary-soft-2`
- `--rose-fg`
- `--stone`
- `--surface`
- `--surface-cool`
- `--surface-press`
- `--surface-sink`
- `--surface-soft`
- `--text-body`
- `--text-body--line-height`
- `--text-caption`
- `--text-caption--line-height`
- `--text-display`
- `--text-display--line-height`
- `--text-emphasis`
- `--text-emphasis--line-height`
- `--text-group`
- `--text-group--line-height`
- `--text-page`
- `--text-page--line-height`
- `--text-stat`
- `--text-stat--line-height`
- `--warn-bg`
- `--warn-fg`
- `--area-analysis`
- `--area-intelligence`
- `--area-library`
- `--area-review`
- `--banner-1`
- `--banner-2`
- `--banner-3`
- `--bar`
- `--bar-soft`
- `--canvas`
- `--charcoal`
- `--danger-line`
- `--dim-issue`
- `--dim-outcome`
- `--dim-scene`
- `--dim-tech`
- `--ease-panel`
- `--green`
- `--hairline`
- `--hairline-soft`
- `--hairline-strong`
- `--heading`

完整列表以 `globals.css` 为准。

### Token 核心值（速查）

数值仅速查，真源 `frontend/src/styles/globals.css`，改值先改 CSS；数值以 globals 为准，冲突时改代码不另写第二套。

| 变量 | 值 | 用途 |
|---|---|---|
| `--heading` | `#1f3147` | 标题 / 强调字 |
| `--text-2` / `--text-3` | `#3d4b5c` / `#6b7a8c` | 正文 / 说明 |
| `--canvas` / `--surface` | `#ffffff` / `#f5f7fa` | 画布底 / 表面 |
| `--line-cool` / `--line-cool-soft` / `--line-cool-strong` | `#e2e7ee` / `#edf0f4` / `#b4c1d2` | 线 / 软线 / 强线 |
| `--primary` / `--primary-pressed` / `--primary-soft` | `#345a78` / `#25435c` / `#eaf0f5` | 仅可交互主色 / 按下 / 浅主色底 |
| `--link` | `#2f6289` | 链接 |
| `--focus-data` | `#2e8b7a` | 数据焦点，不是按钮主色 |
| `--dur-quick` / `--dur-small` / `--dur-panel` / `--dur-layout` | `120ms` / `200ms` / `320ms` / `520ms` | 四档时长（用途见「交互层级与动效」） |
| `--ease-out` | `cubic-bezier(.16, 1, .3, 1)` | 统一缓出 |

字号阶（工具类 `text-caption` … `text-display`；大屏 2200px / 3000px 上调见 globals）：

| 阶 | 字号 / 行高 | 用途 |
|---|---|---|
| caption | 12 / 16 | 仅辅助说明 |
| body | 14 / 20 | 正文 |
| emphasis | 16 / 24 | 强调正文 |
| group | 18 / 28 | 分组标题 |
| page | 22 / 30 | 页标题 |
| stat | 28 / 36 | 数字统计 |
| display | 38（行高 1） | 仅领导页 banner 大数字 |

字号只用 `--text-*` / `text-*` 阶；`text-[12px]` 之类硬编码像素与 Tailwind 自带字号类会被 `frontend/src/tokens.test.mts` 拒绝。

## 交互层级与动效（2026-10-27）

来源：`.logsdev/tasks/领导体验优化-20261026/README.md` §4、`.logsdev/前端审查-20261027.md`。

- **按钮**：`Button variant="primary"` 每个区域最多一个（主操作）；`outline` 用于打开、导出、展开（冷色描边，悬停变主色）；`ghost` 用于工具栏和图标操作。
- **切换**：视图、列表方式、分类一律用 `Segmented`（`ui.tsx`），改变下方内容的用 `tabs`；不要在页面里手写轨道加白底按钮。
- **可点卡片**：整张可点，末尾 `打开 ›`，悬停边框变主色加轻阴影；附加信息用角落 ⓘ，不在卡片底部再放一排按钮。
- **中性色**：只有一套冷灰。正文 `--text-2`，说明 `--text-3`，线 `--line-cool*`，底 `--surface*`；旧名 `--slate`、`--steel`、`--stone`、`--charcoal` 已改为同样的冷色值，新代码直接用新名。
- **颜色角色**：`--primary` 只给可交互的东西；`--focus-data` 是数据焦点；维度、领域的颜色只做小色点或图表数据色，不做大面积卡片底色。
- **圆角**：只用六档（`globals.css` 的 `--radius-*`，类名 `rounded-xs…2xl`）：xs 2px 图表标记与色块 · sm 4px 标签、徽标、小格子 · md 6px 按钮、输入框、小控件 · lg 8px 菜单、提示、列表行、分段轨道 · xl 12px 卡片与面板 · 2xl 16px 大容器、对话框、页头横幅；胶囊和圆点用 `rounded-full`。写 `rounded-[7px]` 或 CSS 里的像素圆角会被 `tokens.test.mts` 拒绝。
- **动效**：只用 `--dur-quick`（悬停、按下）、`--dur-small`（浮层、菜单）、`--dur-panel`（侧栏、页签内容）、`--dur-layout`（图表、谱系重排）四档和 `--ease-out`；“减少动态效果”由 `globals.css` 的全局规则统一处理。
- **大列表**：折叠区里成千条的内容只在展开时渲染。

## 不要做

1. 不引入 shadcn，不运行 `ui-component-sourcing`（本仓无 `components.json`）。
2. 不用 baoyu-design 对同一页连出超过 2 版探索稿；定稿进实现，旧稿进 `.logsdev` archive。
3. 不把营销页套路（大渐变英雄区、三列 icon 卡、全大写眉标）塞进工作台。
4. 不为“好看”重做整站；与记忆/PDF 相关的三处优先（引用页可点、任务状态面板、章节树）。
5. 文案：按钮说具体动作（如「保存修改」），错误说明原因和下一步。
6. 不再引入第二套暖灰中性族（中性色见「交互层级与动效」）。
7. 不嵌套卡片（卡套卡）。
8. 正文不用 12px（12 只作 caption）。

## 推荐流程

1. 小改：只读本文 + 改目标文件。  
2. 新气质：再读 `.agents/skills/frontend-design`。  
3. 改完审查：再读 `.agents/skills/web-design-guidelines`。  
4. 探索稿：`.agents/skills/baoyu-design`（限 2 版）。

## 交付自检

其余自检项见 `.agents/skills/dox-ui` §3；这里只列本文要求的三项：

- [ ] `frontend/src/tokens.test.mts`（及同目录相关 UI 测试）通过，`./scripts/check.sh quick` 会跑到。
- [ ] 折叠区未展开时不渲染重内容（见「交互层级与动效」）。
- [ ] `prefers-reduced-motion` 下无自写冲突动画，全局规则由 `globals.css` 统一处理（见「交互层级与动效」）。
