# Design

## Context

客户端采用 Next.js 静态导出（`output: "export"`）与 Tailwind CSS v4，当前通过根节点 `data-theme` 切换「水墨深色」与「纸张浅色」两套 CSS 变量，并使用 `react-transition-group` 实现 `TimelineCurrentDate` 月份翻页与 `Message` 提示动画。详见 `proposal.md` 中的背景与动机。

## Goals / Non-Goals

**Goals:**
- 在不引入额外运行时动画库、不改变服务端 API 与共享契约的前提下，统一首屏骨架、轴线微交互、主题切换扩散、卡片阅读折叠、多媒体触控及内联确认体验。
- 所有新增过渡与动画均受 `motion-safe` / `prefers-reduced-motion` 约束，确保键盘可访问性与静态导出兼容性。

**Non-Goals:**
- 不改造后端同步、鉴权、分页或搜索接口。
- 不为时间线列表引入虚拟滚动或复杂手势库。

## Decisions

### 1. 首屏与列表加载复用统一的档案骨架布局

- **方案**：将时间线页面的双栏网格（左侧/顶部常驻工具栏 + 右侧带 `border-binding` 装订线的档案区）提取为稳定的外壳结构。在 `RootLayout` 确认登录态（`正在确认登录状态…`）、`TimelineHome` 加载来源清单（`正在加载筛选来源`）以及首屏条目加载期间，均在装订线右侧渲染带脉冲微光的骨架卡片，并将状态提示文本（`role="status"`）或错误重试控件（`role="alert"`）内嵌于档案区顶部。
- **取舍**：相比全屏居中文字，复用档案外壳能彻底消除首屏三次布局跳变（CLS），同时保留既有无障碍角色与文本，兼容现有端到端测试对加载状态与错误恢复的断言。

### 2. 纯 CSS 状态联动与 `@starting-style` 驱动微交互

- **装订线游标点亮**：在 `.timeline-item` 上利用 `:hover` 与 `:focus-within` 伪类驱动左侧 `::before` 圆点刻度（放大至 `1.25` 倍并切换为 `--primary` 颜色）以及 `TimelineItemLabel` 桌面端 `<time>` 颜色提亮，无需在每个条目上绑定 React 悬停状态。
- **年份与月份同步翻页**：在 `TimelineCurrentDate` 中为中文大写年份增设一组 `TransitionGroup` + `CSSTransition`（复用 `fade-y` 过渡类），使跨年与跨月具备一致的上下淡入淡出效果。
- **条目入场与浮层显隐**：为 `.timeline-item` 增加 `motion-safe` 下的轻柔上浮淡入关键帧；对下拉菜单（搜索排序、类型列表、工具菜单、条目菜单）、回到顶部按钮及 `<dialog>` 面板采用 CSS `@starting-style` 与过渡属性，避免因卸载动画阻塞交互或推迟 DOM 清理。

### 3. 基于 View Transitions API 的主题切换扩散过渡

- **方案**：在 `ThemeToggle` 中切换主题时，若浏览器支持 `document.startViewTransition` 且未启用 `prefers-reduced-motion: reduce`，则根据按钮 `getBoundingClientRect()` 计算中心坐标与到视口四角的最大半径，写入根元素 CSS 变量，并在 `startViewTransition` 回调内同步更新 `document.documentElement.dataset.theme`、React 状态与 `localStorage`。通过 `::view-transition-new(root)` 的圆形 `clip-path` 动画实现从按钮向外扩散的墨迹/纸页铺展效果。
- **回退**：不支持 `startViewTransition` 或启用减少动态效果时，直接同步更新 `dataset.theme` 与状态，确保状态变更零延迟。

### 4. 长文折叠容器支持「收起全文」与阅读锚点回滚

- `ExpandableContainer` 在内容高度超过 `0.8 * window.innerHeight` 时折叠正文，底部渐隐遮罩延伸至展开按钮上方。展开和收起按钮分别显示向下和向上图标，并占满卡片宽度，无障碍名称分别为「展开全文」和「收起全文」。展开后解除高度限制并聚焦容器。收起时恢复折叠高度并聚焦容器，若容器顶部已滚出视口上方，则滚回顶部。视觉过渡遵循系统减少动态效果设置。
- **卡片描边层次**：为 `ExpandableContainer` 及各时间线正文卡片统一补充细微的 `ring-1 ring-binding/60 ring-inset`，解决纸张浅色与水墨深色下纯色卡片边界弱化的问题。

### 5. Bilibili 卡片底部渐变浮层与走马灯触控手势

- Bilibili 卡片在 16:9 封面底部使用单向渐变浮层呈现标题 `<h1>` 与简介 `<p>`，通过 `binding` 描边区分卡片和页面背景。标题以「、『、【、（等全角起始标点开头时，使用 `-0.5rem` 的行首外边距对齐简介。封面的悬停或聚焦微缩放遵循系统减少动态效果设置。
- **走马灯 `Slideshow`**：
  - 增加原生 Pointer / Touch 水平滑动识别（记录起点坐标，释放时若水平位移超过 `40px` 且大于垂直位移则触发 `go(-1 | 1)`）；
  - 底部页码指示点改为常驻可见（桌面端悬停时提高不透明度，移动端无需悬停即可观察与点击），并在左右切换热区内补充可感知的箭头视觉提示。

### 6. 条目菜单内联二次确认与 `LoginModal` 原生 `<dialog>` 化

- **内联二次确认**：在 `TimelineItemLabel` 中移除 `window.confirm`，新增 `confirmingAction: "secret" | "delete" | null` 状态（菜单关闭时自动重置）。点击「设为私密 / 设为公开」或「删除」时，菜单保持打开并将该操作项替换为内联确认区（展示提示文案及「确认操作」「取消」按钮）。点击「确认操作」后关闭菜单并发送 `PATCH` 或 `DELETE` 请求；点击「取消」或按 `Escape` 则放弃操作。
- **登录弹窗 `<dialog>` 化**：将 `LoginModal` 根节点改为 `<dialog id="login-modal" aria-label="管理员登录">`，通过 `showModal()` / `close()` 管理模态态与焦点约束，支持关闭按钮、Esc 及点击外部背景关闭，并通过 `html:has(#login-modal[open])` 统一管理页面滚动锁定。

## Risks / Trade-offs

- [View Transitions 动画期间快速连续点击主题切换] → 在 `ThemeToggle` 中无论动画是否进行，状态与 `localStorage` 均同步更新，新一次切换会自动接管或跳过上一轮视图过渡。
- [内联二次确认改变既有 E2E 测试的原生 `dialog` 监听方式] → 同步更新 `client/e2e/admin-tools.spec.mts` 中涉及「设为私密 / 设为公开」与「删除」的测试用例，直接验证菜单内联确认与取消流程。
- [走马灯水平滑动手势与页面纵向滚动冲突] → 仅在水平位移大于垂直位移且超过 `40px` 阈值时触发幻灯片切换，保留浏览器默认的纵向滚动行为。

## Migration Plan

纯客户端界面与交互变更，随 `bun run build:client` 静态构建发布，无需数据库或服务端配置迁移；回滚时恢复上一版静态构建产物即可。
