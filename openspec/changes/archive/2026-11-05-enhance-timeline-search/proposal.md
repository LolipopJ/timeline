# Proposal

## Why

时间线的筛选状态目前只在筛选值变化时单向写入 URL：组件初始化后不再回读 URL，因此浏览器后退/前进、刷新和粘贴链接都无法可靠恢复筛选结果；筛选参数也只有关键词与排序，无法表达「某一条时间线项」或「某一来源类型」。这使阅读结果无法被分享，也无法把某条条目单独发给他人查看。

## What Changes

- 让 URL 成为时间线筛选状态的唯一来源：关键词、排序、单条 ID 与来源类型都从 URL 读取，浏览器后退/前进、刷新和直接粘贴链接均能恢复同一结果。
- 搜索框支持两种结构化语法：`id:<uuid>` 按时间线项 ID 精确筛选，`type:<SyncService.id>` 按来源类型筛选。搜索框内以可删除的标签展示 ID 与类型条件，标签删除后立即回到对应结果。
- 时间线项菜单新增「复制分享链接」：复制包含当前条目 `id:` 条件的完整链接，不改动当前 URL 或筛选状态；打开该链接时列表只显示这一条。「复制分享链接」和「只看当前类型」排在「打开链接」之后。
- 时间线项菜单新增「只看当前类型」：写入 `type:` 条件并立即生效，与手动输入类型条件等价。
- `id:` 条件与关键词、类型条件互斥：写入 ID 时清空其它条件，反之亦然。枚举 `SyncServiceType` 中尚未实现同步的取值不提供类型入口。
- 筛选的离散操作（粘贴 ID、只看当前类型、删除标签、切换排序）立即写入 URL，不等待关键词输入的防抖。
- 后端时间线列表与总数接口新增按 ID 精确过滤，并沿用现有可见性规则：访客打开私密条目的分享链接得到空结果，管理员可正常查看。
- 新增公开的 `/timeline-services` 接口，仅返回配置服务与当前视角可见存储来源的 ID 列表，供客户端识别已知的 `type:` 条件，不输出服务配置或凭据。
- **BREAKING**：移除仅被读取、从未由界面写入的 `serviceType` URL 参数；类型条件统一以 `type:` 语法出现在 `search` 参数中，并由客户端转换为既有的 `serviceId` 后端筛选参数。

## Capabilities

### New Capabilities

- `timeline-search`: 时间线筛选状态的 URL 表示与回读、搜索框的 ID 与来源类型语法、条目分享链接与按类型查看。

### Modified Capabilities

无。现有 `timeline-navigation`、`guest-preview` 与 `display-theme` 的既有要求不变；本次只是为搜索补充可分享的 URL 状态，并继续在搜索、排序、分页与计数前应用同一可见性范围。

## Impact

- 客户端：`client/src/components/TimelineHome`（筛选状态与 URL 同步）、`client/src/components/TimelineSearch`（标签与语法解析）、`client/src/components/TimelineItemLabel`（分享链接与只看类型菜单），以及筛选参数的解析工具。
- 共享契约：`packages/contracts/src/timeline.ts` 的列表与总数查询参数新增按 ID 过滤字段。
- 后端：`server/src/api/timeline-query.ts` 应用 ID 条件，`server/src/index.ts` 的列表与总数接口接受并校验该参数，并提供服务 ID 清单；不新增数据库表或运行时依赖。
- 文档：README 补充搜索语法与分享链接说明，并更新 `docs/` 中的相应描述（如涉及筛选说明）。
