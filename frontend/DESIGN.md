# dox_agent 前端设计约定（DESIGN.md）

> Agent 改 UI 前必读。唯一入口 skill：`.agents/skills/dox-ui`。  
> 本文从现有 `globals.css` / `ui.tsx` 抽出，**不是**新设计系统。

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

## 不要做

1. 不引入 shadcn，不运行 `ui-component-sourcing`（本仓无 `components.json`）。
2. 不用 baoyu-design 对同一页连出超过 2 版探索稿；定稿进实现，旧稿进 `.logsdev` archive。
3. 不把营销页套路（大渐变英雄区、三列 icon 卡、全大写眉标）塞进工作台。
4. 不为“好看”重做整站；与记忆/PDF 相关的三处优先（引用页可点、任务状态面板、章节树）。
5. 文案：按钮说具体动作（如「保存修改」），错误说明原因和下一步。

## 推荐流程

1. 小改：只读本文 + 改目标文件。  
2. 新气质：再读 `.agents/skills/frontend-design`。  
3. 改完审查：再读 `.agents/skills/web-design-guidelines`。  
4. 探索稿：`.agents/skills/baoyu-design`（限 2 版）。
