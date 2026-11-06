# Tasks

## 1. 首屏档案骨架与时间轴微交互

- [x] 1.1 在 `RootLayout` 与 `TimelineHome` 中为身份确认、来源清单加载及首屏列表加载提供统一的「工具栏 + 装订线 + 骨架卡片」档案外壳，保留 `正在确认登录状态…`、`正在加载筛选来源` 及错误重试语义；在 `client/e2e/admin-tools.spec.mts` 中验证加载阶段存在装订线框架且状态与错误重试测试通过。
- [x] 1.2 在 `TimelineItem`、`TimelineItemLabel`、`TimelineCurrentDate` 与 `animation.css` 中实现装订线圆点刻度与桌面时间戳的悬停/聚焦高亮联动、条目入场过渡动画，以及跨年时中文大写年份的 `fade-y` 翻页过渡；在 `client/e2e/admin-tools.spec.mts` 中验证跨年滚动过渡与条目悬停/聚焦时的刻度及时间样式变化。

## 2. 主题扩散切换与卡片描边层次

- [x] 2.1 在 `ThemeToggle` 与 `globals.css` 中接入基于 View Transitions API 的圆形扩散切换动画（在不支持或启用 `prefers-reduced-motion` 时直接切换），并为时间线正文与媒体卡片补充 `ring-binding` 内描边；在 `client/e2e/admin-tools.spec.mts` 中验证常态与减少动态效果下的主题切换、焦点保持及双主题卡片描边表现。

## 3. 长文折叠收起与多媒体卡片交互

- [x] 3.1 在 `ExpandableContainer` 中提供底部渐隐遮罩、整行可点击的展开和收起图标按钮以及跨视口回滚聚焦。在 `client/e2e/admin-tools.spec.mts` 中验证图标按钮宽度、长文展开聚焦、整行收起点击、高度恢复与滚动位置回归。
- [x] 3.2 在 `TimelineItemBilibiliCollection` 中使用底部单向渐变浮层和封面悬停微缩放，并通过负行首外边距对齐以全角起始标点开头的标题。在 `Slideshow` 中增加水平触摸滑动切换、常驻可见的底部页码指示点及左右切换视觉引导。在 `client/e2e/admin-tools.spec.mts` 中验证 Bilibili 卡片双主题样式和标题偏移、走马灯指示点可见性及滑动切换行为。

## 4. 内联二次确认与弹窗及浮层过渡

- [x] 4.1 在 `TimelineItemLabel` 中将「设为私密 / 设为公开」与「删除」改为菜单内联二次确认（含「确认」与「取消」操作），移除原生 `window.confirm`；同步更新 `client/e2e/admin-tools.spec.mts` 中的私密切换用例并补充内联取消与删除确认验证。
- [x] 4.2 将 `LoginModal` 重构为原生 `<dialog>` 模态框（支持关闭按钮、Esc 及背景点击关闭），并为 `LoginModal`、`AdminConsole`、回顶按钮及导航下拉菜单补齐 `@starting-style` 显隐过渡；在 `client/e2e/admin-tools.spec.mts` 中验证 `/?login` 模态框交互、关闭后 URL 清理及管理面板抽屉功能。

## 5. 集成检查

- [x] 5.1 运行 `bun run lint:client`、`bun run --filter @timeline/client typecheck` 与 `bun run build:client`，并对静态构建产物执行 `node node_modules/@playwright/test/cli.js test`，确认桌面与移动视口全部端到端测试通过。
