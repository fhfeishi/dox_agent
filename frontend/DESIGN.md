# dox_agent 前端设计约定（DESIGN.md）

> **必读。** Agent 改 UI 前先读本文。唯一入口 skill：`.agents/skills/dox-ui`。  
> 本文从现有 `frontend/src/styles/globals.css` / `frontend/src/components/ui.tsx` **抽出**，不是新设计系统；禁止另起品牌色或换栈。

---

## 1. Meta

| 项 | 约定 |
|---|---|
| 入口 skill | `.agents/skills/dox-ui` |
| Token 真源 | `frontend/src/styles/globals.css` |
| 基础件真源 | `frontend/src/components/ui.tsx` |
| 本文角色 | 可执行约束；数值以 globals 为准，冲突时改代码不另写第二套 |

---

## 2. PRODUCT vs DESIGN

| 层 | 管什么 | 不在本文 |
|---|---|---|
| **PRODUCT** | 用户目标、证明物、文案语气、功能优先级 | 另文（产品 brief / 任务说明） |
| **DESIGN（本文）** | 视觉 token、组件复用、交互层级、动效、硬禁令 | 产品目标与文案策略 |

改 UI 时：PRODUCT 定「做什么 / 证明什么」；本文定「看起来与点起来怎样」。

---

## 3. 栈（不要换）

- React 19 + Vite + TypeScript + Tailwind CSS v4
- **无** shadcn / Radix；基础件只在 `frontend/src/components/ui.tsx`
- Token 只在 `frontend/src/styles/globals.css`（CSS 变量）
- 字体：`.font-app` = Inter + 系统 CJK；代码 `.font-code`
- 栏宽：`--page-max: clamp(1200px, 76vw, 2240px)`；字号在 **2200px / 3000px** 各上调一档

---

## 4. 短动词（固定）

改 UI 时只使用下列意图词；实现前先对号入座：

| 动词 | 在本仓含义 |
|---|---|
| **polish** | 在现有布局上收边：间距、对齐、悬停、焦点；不换信息架构 |
| **distill** | 删多余控件/文案/色块；保留任务路径上的一件主操作 |
| **quieter** | 降对比、减饱和、减动效幅度；中性色回到冷灰族 |
| **critique** | 对照本文硬禁令与交互层级列问题；先列后改 |
| **harden** | 补键盘焦点、禁用态、展开才渲染大列表、token/`text-*` 合规 |

---

## 5. 现有组件（优先复用）

| 组件 | 用途 |
|---|---|
| `TONE_BG` | tone → 浅底色映射 |
| `Pill` | 小标签 |
| `Button` | 主/描边/幽灵按钮 |
| `ToolButton` | 工具栏图标操作 |
| `VDivider` | 竖分隔 |
| `PanelRow` | 面板行 |
| `GroupLabel` | 分组标题 |
| `SearchField` | 搜索框 |
| `Card` | 卡片容器 |
| `Segmented` | **视图 / 列表方式 / 分类切换**（改变下方内容用 `tabs` 语义；禁止手写轨道+白底按钮） |

Tone：`"mint" \| "peach" \| "lav" \| "sky" \| "rose" \| "gray" \| "yellow"`。

新增视觉：**优先给现有件加变体**，不新开平行 primitive 文件。变体细节以 `ui.tsx` 为准。

---

## 6. Token（核心值；完整列表 = globals.css）

改色 / 字号 / 动效必须用 `--*`，禁止随手 hex。下列为核心可读集（与 main 上 `globals.css` 对齐）：

### 文字与中性

| 变量 | 值 | 用途 |
|---|---|---|
| `--heading` | `#1f3147` | 标题 / 强调字 |
| `--text-2` | `#3d4b5c` | 正文 |
| `--text-3` | `#6b7a8c` | 说明 / 次要 |
| `--canvas` | `#ffffff` | 画布底 |
| `--surface` | `#f5f7fa` | 表面 |
| `--surface-soft` | `#fafbfc` | 更浅表面 |
| `--surface-sink` | `#edf1f5` | 下沉表面 |
| `--surface-cool` | `#f6f8fb` | 冷表面 |
| `--page-cool` | `#f5f7fa` | 页底冷灰 |
| `--line-cool` | `#e2e7ee` | 线 |
| `--line-cool-soft` | `#edf0f4` | 软线 |
| `--line-cool-strong` | `#b4c1d2` | 强线 |

旧名 `--slate` / `--steel` / `--stone` / `--charcoal` / `--hairline*` 已映射到同一冷灰族；**新代码优先** `--text-2` / `--text-3` / `--line-cool*`。

### 交互与链接

| 变量 | 值 | 用途 |
|---|---|---|
| `--primary` | `#345a78` | **仅**可交互主色 |
| `--primary-pressed` | `#25435c` | 按下 |
| `--primary-soft` | `#eaf0f5` | 浅主色底 |
| `--link` | `#2f6289` | 链接 |
| `--focus-data` | `#2e8b7a` | **数据焦点**（选中圆、聚焦柱等），不是按钮主色 |

领域 / 维度色只做**小色点或图表数据色**，不做大面积卡片底色。

### 字号阶（硬编码 px 会被 `typography.test.mts` 拒绝，若该测试存在）

| 阶 | 字号 / 行高 | 用途 |
|---|---|---|
| caption | 12 / 16 | **仅**辅助说明；正文禁止 12 |
| body | 14 / 20 | 正文 |
| emphasis | 16 / 24 | 强调正文 |
| group | 18 / 28 | 分组标题 |
| page | 22 / 30 | 页标题 |
| stat | 28 / 36 | 数字统计 |
| display | 38（行高 1） | **仅**领导页 banner 大数字 |

工具类：`text-caption` … `text-display`。大屏 2200px / 3000px 上调见 globals。

### 动效

| 变量 | 值 | 用途 |
|---|---|---|
| `--dur-quick` | `120ms` | 悬停、按下、刻度 |
| `--dur-small` | `200ms` | 浮层、菜单、chip |
| `--dur-panel` | `320ms` | 侧栏、页签内容 |
| `--dur-layout` | `520ms` | 图表、谱系重排 |
| `--ease-out` | `cubic-bezier(.16, 1, .3, 1)` | 统一缓出 |

`prefers-reduced-motion` 由 `globals.css` 全局处理，组件勿另写一套。

### 语义与图表（摘）

- 语义：`danger` / `warn` / `ok` / `info` / `lav` / `rose` / `orange` 的 `*-fg` / `*-bg` / `*-line` 以 globals 为准。
- 图表亮色 `--green` / `--orange` / `--purple` / `--pink` / `--red` 是 **数据例外**（见 `tokens.test.mts`），不作 UI 大面积填充。

完整变量名列表以 `globals.css` 为准；本文不重复全表。

---

## 7. 交互层级

1. **按钮**：每个区域最多一个 `Button variant="primary"`（主操作）；`outline` = 打开 / 导出 / 展开（冷描边，悬停主色）；`ghost` = 工具栏与图标操作。
2. **Segmented**：视图、列表方式、分类一律用 `Segmented`；改变下方内容用 tabs 语义；禁止手写轨道 + 白底按钮。
3. **可点卡片**：整张可点；末尾 `打开 ›`；悬停主色边框 + 轻阴影；附加信息用角落 ⓘ，**不要**在卡片底再放一排按钮。
4. **颜色角色**：`--primary` 只给可交互；`--focus-data` 给数据焦点；领域色 = 点 / 图，非大卡底。
5. **中性色**：一套冷灰；正文 `--text-2`，说明 `--text-3`，线 `--line-cool*`，底 `--surface*`。
6. **动效**：只用上表四档时长 + `--ease-out`。
7. **大列表**：折叠区内成千条内容**仅在展开时渲染**。

文案：按钮写具体动作（如「保存修改」）；错误说明原因与下一步。

---

## 8. Craft-floor 硬禁令（不是建议）

1. **禁止**引入 shadcn / Radix；**禁止**跑 `ui-component-sourcing`（本仓无 `components.json`）。
2. **禁止**随手写 hex / 主题外间距；颜色与字号用 `--*` / `text-*`。
3. **禁止**再引入一套暖灰中性族；中性只走冷灰（`--text-2` / `--text-3` / `--line-cool*` / `--surface*`）。
4. **禁止**嵌套卡片（卡套卡）。
5. **禁止**营销套路：全大写 eyebrow / kicker、三列 icon 卡、紫粉渐变英雄区塞进工作台。
6. **禁止** baoyu-design 对同一页连出超过 **2** 版探索稿；定稿进实现，旧稿进 `.logsdev` archive。
7. **禁止**平行 primitive 文件；新视觉加 `ui.tsx` 变体。
8. **禁止**正文用 12px（12 = caption only）；**禁止**同一区域两个 primary `Button`。
9. **禁止**为「好看」重做整站；优先记忆 / PDF 引用可点、任务状态面板、章节树。

---

## 9. 推荐流程

1. **小改**：只读本文 + 改目标文件（动词：polish / quieter / harden）。
2. **新气质**：再读 `.agents/skills/frontend-design`（动词：distill）。
3. **改完审查**：再读 `.agents/skills/web-design-guidelines`（动词：critique）。
4. **探索稿**：`.agents/skills/baoyu-design`，**最多 2 版**。
5. 实现落在现有组件与 token；PR 描述写所用短动词。

---

## 10. 验收

- [ ] 浏览器对照本文：按钮层级、Segmented、可点卡、冷灰中性、无营销英雄区。
- [ ] 无新增 hex 品牌色；无 shadcn；无平行 primitive。
- [ ] 若存在：跑 `frontend` 下 `typography.test.mts`、`tokens.test.mts`（及同目录相关 UI 测试）通过。
- [ ] 大列表折叠未展开时不渲染重内容；`prefers-reduced-motion` 下无自写冲突动画。

---

*bots-des 升级稿 · 2026-10-30 Asia/Shanghai · 拟替换 `frontend/DESIGN.md`*
