# Verification

## Result

2026-11-03：同步管理、当前进程日志、访客预览与身份/视角缓存隔离已实现。19 项 Bun 回归、22 项桌面/移动浏览器回归通过。

## Changes

- 同步协调器统一拥有当前运行、最近结果和在途 Promise；手动、定时、启动全量及退出等待共用该状态。QQ 空间缺少必需凭据时明确失败，逐服务错误摘要脱敏后返回。
- 新增受现有 Cookie/JWT 鉴权保护的 `GET/POST /admin/sync` 和 `GET /admin/logs`；管理、列表、总数及登录响应禁止缓存。
- 统一日志先安全格式化和脱敏，再向控制台与内存写入同一文本；内存仅保留 500 条，每条最多 4096 字符。
- 单实例管理面板提供同步、日志、预览与退出，使用原生 modal dialog 处理焦点和 Escape。可见同步页每 2 秒刷新，可见日志页每 5 秒刷新并支持暂停。
- 列表与总数共用后端可见性条件；客户端按真实身份和读取视角重建独立 SWR provider。保留搜索及来源筛选，重置分页和进度，旧响应只能返回旧缓存范围。
- 退出改为显式 POST，失败可重试；成功退出或 401 立即移除受限界面。README 已说明操作、保留限制及两端成组发布/回退。

## Checks

| 工作目录 | 实际检查 | 结果 |
| --- | --- | --- |
| 根目录 | `bun run lint:client` | 通过 |
| 根目录 | `bun run lint:server` | 通过，包含共享契约 |
| 根目录 | `bun run --filter @timeline/contracts typecheck` | 通过 |
| 根目录 | `bun run --filter @timeline/server typecheck` | 通过 |
| 根目录 | `bun run --filter @timeline/client typecheck` | 通过 |
| 根目录 | `bun run build:client` | 通过，静态导出完成 |
| `server` | `bun test src/sync/coordinator.test.ts src/sync/qzone.test.ts src/utils/runtime-logs.test.ts src/utils/logger.test.ts` | 10 项通过 |
| `server` | `bun test src/admin.test.ts` | 6 项通过 |
| `server` | 同一 API 回归命令，进程环境设置 `ADMIN_TOOLS_DISABLED=1` | 3 项通过 |
| 根目录 | `node node_modules/@playwright/test/cli.js test` | 22 项通过；1440×1000 桌面和 390×844 移动尺寸各 11 项 |
| 根目录 | `openspec validate upgrade-client-admin-tools --strict` | 通过 |
| 根目录 | `git diff --check` | 通过 |

`bun run lint` 已执行，退出码 2：根脚本引用不存在的 `scripts/`。这是 AGENTS.md 已注明的问题；按其指示使用上述分区 lint，两端及契约均通过。

浏览器验证使用 `client/out` 静态产物，由现有 serve 依赖预览。覆盖键盘打开/关闭和焦点恢复、同步受理与完成区分、完成后只刷新一次、受理响应丢失且不重放 POST、关闭后任务继续、日志纯文本/筛选/刷新/暂停/隐藏、登录和退出重试、来源筛选保留、预览往返与刷新，以及已有私密设置操作。

延迟响应回归先加载多页管理员内容和日志，再保留在途请求；分别切换预览、退出或收到 401 后释放旧响应。公开列表、日志界面与按公开总数计算的进度均未被旧数据恢复。日志请求直接返回 401 和身份尚未确认时不读取管理接口也已覆盖。

已目视核对桌面与移动管理面板截图；截图保存在被忽略的 `server/.temporary/playwright`。生产代码中无 `isSyncing` 或 `runningSyncTasks` 残留；没有新增运行时依赖、数据库表、配置/账号管理或持久化日志。

## Limits

HTTP 路由与生命周期回归使用隔离配置、内存数据和同步执行替身；浏览器拦截 API 响应。未连接真实 PostgreSQL、未调用外部平台采集，也未部署生产环境。真实平台凭据、网络访问和数据库写入需在对应运行环境确认。

客户端与服务端需成组发布或回退；运行记录和日志为单进程内存状态，重启即清空，不需要数据迁移。

## Commit Message

```text
feat(admin): add sync, logs and guest preview

Prevent private data surviving logout or view changes.
```
