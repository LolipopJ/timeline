# Review

使用 3 名子代理分别审查输入与 URL 状态、后端契约与权限、分享菜单与验收覆盖，并复核修复。以下 6 项 P2 问题均已复现并修复，未提交或归档。

## Findings

- [P2] `client/src/components/TimelineSearch/index.tsx:L75`：逐字输入 `type:feedExtra` 会在 `type:feed` 时提前生成标签，未知后缀也被吞掉；已改为空白或 Enter 确认键入条件，完整粘贴立即确认。
- [P2] `client/src/components/TimelineSearch/index.tsx:L122`：IME 预编辑期间消费条件并清空输入；已在合成期间保留草稿、取消提交，合成结束后统一处理输入。
- [P2] `client/src/components/TimelineItemLabel/index.tsx:L265`：防抖结束前点击「只看当前类型」会用旧关键词覆盖新输入；已通过统一提交层的函数更新合并最新待提交条件。
- [P2] `client/src/components/TimelineHome/index.tsx:L116`：旧页面的剪贴板 Promise 完成后先取消新页面的防抖，造成输入与 URL 永久分离；已先拒绝过期 URL 下的回调，再处理当前计时器。
- [P2] `server/src/index.ts:L303`、`server/src/database/controller/timeline-item.ts:L71`：已移除配置但仍存储的来源不在清单中，导致菜单与直接链接退化为关键词；已合并配置 ID 与当前视角可见、未软删除条目的 DISTINCT 来源 ID，并按视角隔离客户端清单缓存。
- [P2] `client/src/components/TimelineSearch/index.tsx:L31`：`hello ` 防抖回写后丢失尾空格，继续键入 `world` 变成 `helloworld`；已在 URL 关键词语义相同时保留原始草稿，不同条件的导航仍重置草稿。

## Verification

- 修复前新增回归：4 项桌面浏览器用例、来源清单服务端用例及尾空格用例均按预期失败，确认覆盖真实问题。
- `bun run lint:client`、`bun run lint:server`：通过。
- `bun run --filter @timeline/client typecheck`、`bun run --filter @timeline/server typecheck`：通过。
- `bun run build:client`：通过，静态导出成功。
- 在 `server/` 运行 `bun test src/admin.test.ts`：10 项通过；设置 `ADMIN_TOOLS_DISABLED=1` 后运行同一文件：7 项通过，包含退役来源、私密来源、软删除来源、非法视角和仅返回 ID 的验证。
- `node node_modules/@playwright/test/cli.js test --grep "structured|source menus|private ID|service catalog|typed conditions|source filtering|late clipboard|IME composition|stored source|keyword spaces|guest preview|keyboard focus" --reporter=json`：桌面与移动共 26 项通过。
- `node node_modules/@playwright/test/cli.js test --reporter=json`：60 项通过、2 项失败。失败仍为既有 `archive joins pages within a month and follows the sorted reading position` 用例在两种视口下的封面颜色断言：期望白色，实际为主题前景色；相关样式及该断言未改。
- 子代理使用本地 TypeORM 离线生成 SQL：公开查询包含 `is_secret = false` 和 `deleted_at IS NULL`；管理员查询仍排除软删除；DISTINCT 只选择来源 ID。未连接真实数据库。
- 首次实现时记录的既有 `logger.test.ts` 失败未在本轮重跑，日志实现及该测试均未修改。

浏览器使用静态产物与 HTTP mock，服务端回归复用既有数据库和同步模块 mock。搜索使用说明与对应 proposal、design、specs 已同步。

## Commit Message

```text
feat(search)!: make timeline filters shareable

BREAKING CHANGE: source filters use type: inside search.
```

## Menu Follow-up

- 服务 ID 按最长的已知完整值匹配，支持 `Lolipop's Thoughts` 中的空格与撇号；菜单、直接链接、键入确认、刷新和标签删除均使用同一解析。可能继续匹配更长 ID 的内部空格不会提前确认。
- 复制分享链接只写剪贴板，成功或失败均保留当前 URL 与筛选；生成的链接仍能按 ID 单独查看条目。
- 菜单顺序调整为「打开链接」「复制分享链接」「只看当前类型」。
- 修复前已分别复现完整服务 ID 标签缺失、复制后跳转到 ID 筛选、菜单顺序错误；用例在复制成功后等待异步回调完成，再断言页面状态不变。
- `bun run lint:client`、`bun run --filter @timeline/client typecheck`、`bun run build:client`：通过。
- 桌面与移动共 30 项相关 Playwright 回归通过，包含上述三项、新增的共同前缀服务 ID、访客预览、URL 恢复和输入草稿用例。本轮未重跑全量浏览器或服务端测试。

### Commit Message

```text
fix(search): handle spaced sources and copy links
```
