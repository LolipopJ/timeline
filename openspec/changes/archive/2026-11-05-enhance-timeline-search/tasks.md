# Tasks

## 1. 打通按 ID 查询的后端能力

- [x] 1.1 在 `packages/contracts/src/timeline.ts` 的列表与总数查询参数中加入按时间线项 ID 过滤的可选字段，并从契约入口导出；验证：`bun run --filter @timeline/contracts typecheck` 通过，且契约不引用任一端实现。
- [x] 1.2 在 `server/src/api/timeline-query.ts` 的 `getTimelineWhere` 中把 ID 条件并入 `base`，确保与 `serviceId`、`is_secret` 同级，因而落在 `search` 的 OR 分支之外；验证：最小 Bun 回归覆盖「ID + 私密项对访客返回空」「ID + 管理员可见」「ID 与关键词同时存在时仍按 ID 精确匹配」。
- [x] 1.3 在 `server/src/index.ts` 的列表与总数接口接收 ID 参数，格式非法时返回 HTTP 400，并确认 `cache-control` 仍为禁止缓存；验证：`bun test src/admin.test.ts` 及新增的可见性用例通过，`bun run --filter @timeline/server typecheck` 通过。

- [x] 1.4 新增公开的 `GET /timeline-services`，只返回配置与当前视角可见、未软删除条目来源的 ID 数组，使用 `private, no-store`；验证：未登录及管理员功能关闭时均可读取，私密与软删除来源遵循列表权限边界，且响应不包含服务配置或凭据。

## 2. 建立筛选条件的解析与 URL 状态

- [x] 2.1 新增客户端筛选工具模块，负责从 `search` 文本提取 `id:` 与 `type:` 条件、把条件与关键词组合回 `search` 文本、把条件转换为请求参数、判断两个筛选状态是否等价；验证：`bun run --filter @timeline/client typecheck` 通过，且工具不依赖 React。
- [x] 2.2 将 `TimelineHome` 的筛选状态改为从 `useSearchParams()` 派生，移除「只在首屏读一次 URL」的初始化与自写回读逻辑，保留 `router.replace(..., { scroll: false })` 写入；验证：手动改动 URL 后刷新、前进、后退均得到同一结果集与排序，列表请求键与 `TimelineHome` 的分组排序字段一致。
- [x] 2.3 移除只读未写的 `serviceType` URL 参数解析与写入，改由条件解析产生的 `serviceId` 请求参数承载来源筛选；验证：`grep` 确认客户端不再读写 `serviceType`，带 `type:` 条件的链接能得到与配置服务一致的结果。
- [x] 2.4 让筛选的离散操作（删除标签、只看当前类型、切换排序）立即写入 URL，关键词输入保留防抖，并在 URL 变化时取消挂起的防抖提交；验证：切换排序后 URL 立即包含 `orderBy`，连续输入时历史记录不逐键增长，后退不被挂起的关键词覆盖。

## 3. 搜索框与时间线项菜单接入条件

- [x] 3.1 在 `TimelineSearch` 中以可删除标签展示 ID 与类型条件，标签删除后立即清除对应条件并刷新；验证：输入 `type:` 与合法 UUID 时出现标签，删除后搜索框与 URL 同步变更。
- [x] 3.2 实现条件互斥：写入 ID 时清空关键词与类型，写入关键词或类型时清除 ID；验证：在 ID 结果中输入关键词后只按关键词搜索，只含 ID 的链接覆盖已有关键词条件。
- [x] 3.3 让非法或未知条件退化为普通关键词，不产生筛选也不阻断搜索；验证：输入 `id:hello` 与未知 `type:` 值时列表按关键词返回结果。
- [x] 3.4 在 `TimelineItemLabel` 菜单加入「复制分享链接」，复制包含 ID 条件的完整链接，成功或失败均不改动当前 URL、筛选与结果，并显示反馈；该入口和「只看当前类型」排在「打开链接」后，私密条目同样提供；验证：复制后当前页面状态不变，打开复制的链接只显示该条条目并出现可删除的 ID 标签。
- [x] 3.5 在 `TimelineItemLabel` 菜单加入「只看当前类型」，使用条目的 `sync_service_id` 写入类型条件并立即刷新；验证：对任一来源条目点击后列表只显示该来源，URL 与搜索框同步出现该条件。
- [x] 3.6 确认只显示一条结果与无结果时，年份/月份章节、当前年月、加载更多与空状态沿用既有逻辑；验证：打开分享链接与打开不存在的 ID 链接时，页面分别展示单条条目与既有空状态，无渲染异常。

## 4. 文档与集成验收

- [x] 4.1 在 README 的搜索说明中补充 `id:` 与 `type:` 语法、分享链接、只看当前类型以及链接可恢复筛选的行为，并核对 `docs/` 中相关描述与实际实现一致；验证：按文档写出的链接能直接打开对应结果，文档不含未实现的描述。
- [x] 4.2 运行 `bun run lint:client`、`bun run lint:server`、`bun run lint:contracts`、两端与契约的 typecheck 以及 `bun run build:client`；验证：所有适用检查通过，记录实际执行的命令与结果。
- [x] 4.3 在桌面与移动尺寸执行一轮组合验收：关键词 + 类型条件、ID 分享链接、后退/前进、刷新、私密条目在访客与管理员下的差异；验证：既有公开读取、私密设置、访客预览与定时同步行为不变，无跨视角数据残留。复用现有 Playwright 配置补充覆盖分享链接与 URL 恢复的最小用例，不引入新的测试框架或依赖。

## Workflow follow-up

- 归档前按项目要求复核改动范围与文档一致性，再使用 `caveman-commit` 生成提交信息。

## Initial Verification

- `bun run lint:client`、`bun run lint:server`、`bun run lint:contracts`：通过。
- `bun run --filter @timeline/client typecheck`、`bun run --filter @timeline/server typecheck`、`bun run --filter @timeline/contracts typecheck`：通过。
- `bun run build:client`：通过，静态导出成功。
- 在 `server/` 运行 `bun test src/admin.test.ts`：9 项通过；设置 `ADMIN_TOOLS_DISABLED=1` 后运行同一文件：6 项通过，覆盖公开服务 ID 清单与按 ID 查询的可见性、计数和非法参数。
- 在 `server/` 分别运行 `bun test src/sync/coordinator.test.ts`、`bun test src/sync/qzone.test.ts`、`bun test src/utils/runtime-logs.test.ts`：分别为 7、2、2 项通过。
- `node node_modules/@playwright/test/cli.js test --grep "structured|source menus|private ID|service catalog" --reporter=json`：桌面与移动共 10 项新增验收通过；已查看两种视口的 ID 筛选截图，布局正常。
- `node node_modules/@playwright/test/cli.js test --reporter=json`：48 项通过、2 项失败。失败均为既有 `archive joins pages within a month and follows the sorted reading position` 用例在桌面与移动下的封面颜色断言：期望 `rgb(255, 255, 255)`，实际为 `rgb(231, 236, 234)`。相关 `feed.tsx`、`globals.css` 和该颜色断言均未修改。新增功能与键盘焦点用例通过；后者已等待立即生效的排序请求返回后再操作条目菜单。
- 在 `server/` 运行 `bun test src/utils/logger.test.ts`：1 项失败。`console and retained messages share redaction before truncation` 用例使用 `.at(-1)` 取倒序日志中最旧的一条，再断言其包含最新日志的 `normal diagnostic`；`logger.ts`、该测试及 `runtime-logs.ts` 均与 HEAD 一致，未扩展本次范围修复。
- `openspec validate enhance-timeline-search --strict`、`git diff --check`、`bunx prettier --check README.md docs/search.md`：通过。

后端回归复用既有数据库与同步模块 mock；浏览器回归使用静态产物与 HTTP mock，未连接真实数据库或外部来源平台。未执行提交或归档。

## Review Follow-up

3 名子代理审查确认的 6 项问题均已复现并修复。最新验证：26 项针对性桌面与移动验收通过，全量浏览器回归 60/62（两项既有封面颜色断言失败），服务端管理员开启与关闭时分别 10/7 项通过。详细位置、修复及实际命令见 [review.md](review.md)。

## Commit Message

```text
feat(search)!: make timeline filters shareable

BREAKING CHANGE: source filters use type: inside search.
```
