# AGENTS.md

Timeline 是聚合多来源内容的个人时间线应用，使用 Bun Workspaces 管理 Next.js 静态客户端、Elysia 服务端和共享接口契约。修改前阅读 [README.md](README.md)、涉及 workspace 的 `package.json` 和对应入口。现有源码与配置是当前行为的依据；OpenSpec 提案不代表功能已经实现。

## 仓库布局

```text
client/
  configs/client.example.ts     客户端公开配置模板
  src/app/                      App Router 页面、布局和全局样式
  src/components/               时间线、搜索、登录及媒体组件
  src/services/axios.ts         HTTP 实例、请求方法和登录过期事件
  src/contexts/                 全局登录状态和上次访问时间
  src/hooks/                    客户端 hooks
  src/utils/                    客户端工具
server/
  configs/server.example.ts     服务端配置模板
  src/index.ts                  HTTP 路由、鉴权、启动、调度和退出处理
  src/api/serializers.ts        数据库实体到 HTTP DTO 的转换
  src/database/                 TypeORM 数据源、实体及数据库操作
  src/sync/                     同步调度入口及各来源采集实现
  src/utils/                    请求、媒体、会话、日志等工具
  .static/                      被 Git 忽略的媒体文件目录
  .temporary/                   被 Git 忽略的缓存和会话目录
packages/contracts/src/         两端共享的枚举和 HTTP DTO
openspec/                      规格及变更规划
.agents/skills/                仓库内的 OpenSpec 工作流技能
```

根目录的 `package.json`、`bun.lock`、`bunfig.toml`、`tsconfig.base.json` 和 `eslint.config.mjs` 统一管理依赖、编译及代码规范。

## 开发命令

使用 Node.js >= 24.22.0 和 Bun >= 1.4.4；Bun 的项目版本以根 `package.json` 的 `packageManager` 为准。从仓库根目录安装依赖，维护唯一的 `bun.lock`，不要新增其他包管理器的锁文件。

| 命令 | 用途 |
| --- | --- |
| `bun install --frozen-lockfile` | 按锁文件安装所有 workspace 依赖 |
| `bun run dev` | 同时启动客户端和服务端 |
| `bun run dev:client` | 启动客户端开发服务，默认端口 3000 |
| `bun run dev:server` | 启动服务端开发服务，默认端口 4000 |
| `bun run build:client` | 构建客户端，静态产物位于 `client/out` |
| `bun run start:client` | 预览已构建的静态客户端 |
| `bun run start:server` | 使用 Bun 直接运行服务端 TypeScript 源码 |
| `bun run lint:client` | 检查客户端 |
| `bun run lint:server` | 检查服务端和共享契约 |
| `bun run lint:contracts` | 仅检查共享契约 |
| `bun run --filter @timeline/client typecheck` | 生成 Next.js 类型并检查客户端 |
| `bun run --filter @timeline/server typecheck` | 检查服务端 |
| `bun run --filter @timeline/contracts typecheck` | 检查共享契约 |

需要自动修复时使用已有的 `lint:client:fix`、`lint:server:fix` 或 `lint:contracts:fix`，仅在本次修改范围内应用修复。根 `lint` 仍引用当前不存在的 `scripts/`，目前优先使用上述分区命令。

根目录没有统一的 `build`、`typecheck` 或 `test` 脚本。管理工具的 Playwright 配置位于 `playwright.config.ts`，用例位于 `client/e2e/admin-tools.spec.ts`。在仓库根目录安装依赖并准备客户端配置后，先运行 `bun run build:client`，再运行 `node node_modules/@playwright/test/cli.js test`，以桌面和移动视口检查静态产物。缺少浏览器时先运行 `node node_modules/@playwright/test/cli.js install chromium`。后端回归从 `server/` 目录按文件运行，例如 `bun test src/admin.test.ts`。

## 配置、数据与运行

- 本地配置由 `client/configs/client.example.ts` 和 `server/configs/server.example.ts` 分别复制为同目录的 `client.ts`、`server.ts`。配置通过 TypeScript 模块直接导入，不要假设项目使用 `.env` 作为配置入口。
- 客户端配置是公开构建输入，API 地址修改后需重新构建。管理员凭据、JWT 密钥、数据库密码、平台令牌和登录会话只能保留在服务端或本地运行数据中，不能写入客户端、示例或提交记录。
- 配置字段分别由 `client/src/types/config.ts` 和 `server/src/types/config.ts` 定义；修改配置时同步维护类型、示例和相关 README 说明。
- PostgreSQL 数据库需要手动创建。开发模式在配置的数据库名称后追加 `_dev`；当前 TypeORM 数据源使用 `synchronize: true`。数据库验证使用开发库，不要用生产库做检查，也不要自行引入兼容旧 schema 的迁移层。
- 服务端启动会连接数据库、创建运行目录并立即触发同步，随后按 `syncInterval` 调度。`FULL_SYNC=true` 会先执行全量同步；仅为检查文档或类型时不要启动服务端。
- 运行目录通过 `server/src/constants/index.ts` 定位到 `server/.static` 和 `server/.temporary`，不依赖启动工作目录。部署及修改路径逻辑时保留已有媒体、缓存和会话数据；这些目录不应提交到 Git。
- 服务端依赖目标平台的 `ffmpeg-static` 处理视频。部署保持 workspace 相对布局及依赖链接，不能把其他平台安装的 ffmpeg 二进制直接复制使用。

## 架构与实现原则

- 选择完整满足当前需求的最简单实现。先完成可运行的端到端版本，再逐层增加能力；不引入推测性的抽象、配置、框架或中间层，也不采用准备以后替换的临时方案。
- 不保留向后兼容路径。改变接口或行为时更新所有调用方并删除废弃实现，不增加别名、旧接口回退或兼容迁移。
- 客户端与服务端仅通过 `@timeline/contracts` 共享枚举和 HTTP DTO，不互相引用源码。共享契约必须保持无框架、无浏览器及服务端运行时依赖；客户端专用 props 和服务端实体、配置各自归属对应 workspace。
- 保持关注点分离：路由负责 HTTP 和权限，serializer 负责输出字段与日期转换，database 层负责存取，sync 模块负责来源采集，客户端组件负责展示和交互。复用这些现有模块，不复制同一职责的实现。
- 优先使用项目已有的 Axios、SWR、TypeORM、Elysia、Marked、Fancybox、Video.js 和媒体工具。新增依赖前检查现有依赖的文档与类型；确有需要时选择维护良好、能减少总体复杂度的库。
- 保持 TypeScript `strict` 配置。共享类型从契约包导入，类型导入使用 `import type`；不要用 `any` 或强制类型断言掩盖接口不一致。外部 HTTP、配置和文件输入需要适当验证，内部已明确类型的数据不重复添加推测性检查。
- 客户端内部沿用 `@/` 路径别名，跨 workspace 使用包名。遵循已有 ESLint、Prettier 和 import 排序规则，不单独引入另一套格式配置。
- 客户端样式优先在组件中使用 Tailwind 工具类，避免为组件新建自定义 CSS 类。全局规则、Markdown 生成内容和第三方组件确需在 CSS 中处理时，用 `@apply` 组合工具类。仅在定义主题变量、映射第三方变量或没有合适工具类时直接写 CSS 声明。
- 保留现有日志和资源释放机制。服务端错误使用 `server/src/utils/logger.ts` 的工具记录可定位的上下文；修改启动、同步或退出流程时保持数据库释放、同步任务等待和清理的幂等性。

## 关键业务约束

- **静态客户端：** `client/next.config.mjs` 使用 `output: "export"`。客户端功能必须能静态导出；不要直接依赖 Next.js API Routes、Server Actions 或服务端渲染来实现现有交互。
- **HTTP 数据：** 响应使用 `packages/contracts/src` 的 DTO，经 `serializeTimelineItem` 输出。时间线及附件日期在 HTTP 中为 ISO 字符串；数据库 `Date`、内部 metadata 等字段不能直接随实体泄露给客户端。改变 DTO 时同步更新 serializer 和全部消费者。
- **查询一致性：** 时间线列表和数量查询必须使用一致的来源、搜索及隐私过滤条件。分页及 `created_at`、`updated_at` 排序的修改需要同时核对 `TimelineHome` 的 SWR 请求键、列表合并和数量统计。
- **管理员权限：** 服务端使用 JWT 和 `access-token` Cookie 校验管理员身份。新增敏感路由必须纳入 `server/src/index.ts` 的 `SENSITIVE_ROUTES`；按钮是否显示不能替代服务端鉴权。未登录用户只能查询公开项目，管理员功能未配置时敏感操作仍应拒绝。
- **登录与缓存：** 客户端复用 `client/src/services/axios.ts`，保持携带 Cookie 和 401 触发 `AUTH_EXPIRED_EVENT` 的处理。登录状态由布局中的 SWR 数据和 `GlobalContext` 提供；修改登录、退出或项目状态时核对相关缓存，避免新增独立且不同步的登录状态。
- **项目存储：** 时间线以 `sync_service_id` 与 `content_id` 的组合唯一，采集通过现有 controller 执行 upsert。不要无故改变服务 ID 或内容 ID。删除和恢复使用 TypeORM 软删除机制，修改采集和更新逻辑时保持隐私与软删除语义。
- **同步调度：** `server/src/sync/index.ts` 跳过 `enabled: false` 的服务，阻止重叠同步，通过 `Promise.allSettled` 隔离各服务失败并记录对应服务。全量同步忽略已有同步时间，但仍受服务 `from` 下限约束；保持这些行为。
- **来源支持：** 当前同步入口实现 Bilibili 收藏及作品、Feed、GitHub Issue 评论、QQ 空间和两类 Steam 同步。枚举中的 Telegram、Weibo、X 不代表已经实现，`weibo.ts` 和 `x.ts` 目前为空。新增来源需贯通契约枚举、配置类型、采集实现、调度注册及客户端展示，不能只增加枚举或空文件。

## 验证与交付

- 开始修改前检查工作区状态，保留用户已有改动；限制改动范围，不顺带格式化或重构无关代码。
- 按影响范围运行对应的 lint 和 workspace 类型检查；共享契约变化需检查契约包和两端消费者。客户端页面、配置或构建逻辑变化还需运行 `bun run build:client`，确认静态导出可用。
- 仅修改文档时核对路径、命令和实现事实，检查 Markdown 及 `git diff --check`，无需运行应用构建或同步任务。不要为可逆的小改动增加测试框架或脚手架。
- 仅在能够复现实际回归，或能守住否则容易漏检的重要行为时增加最小必要测试。涉及隐私、鉴权、软删除或同步去重的变更，应提供针对受影响行为的验证证据。
- 只报告实际执行过的命令及结果。配置、数据库或外部平台条件不足时明确说明未验证的部分；不要把检查计划写成通过记录。检查通过后，除非代码继续变化或出现新问题，不重复运行相同检查。
- 完成编码任务后使用 `caveman-commit` 技能生成简短的 Conventional Commits 提交信息；没有收到提交指令时不自行执行 `git commit` 或推送。

## OpenSpec 与文档维护

已有 OpenSpec 变更时先阅读其 proposal、design、specs 和 tasks，使用与用户请求匹配的 `.agents/skills/openspec-*` 工作流。规划中的能力不能写成当前实现；普通局部修改不自动扩展为新的规划流程。

遵守 `openspec/config.yaml`：OpenSpec artifacts 使用简体中文，保留英文结构标题及 `SHALL`、`MUST` 关键词。接口、配置、运行或部署方式变化时同步更新相关文档和示例；文档只描述有效的当前行为，不保留废弃路径或虚构的门禁。
