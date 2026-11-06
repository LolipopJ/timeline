# Proposal

## Why

Timeline 已支持 Steam 评测等来源，但无法记录游戏白金与全成就解锁。需要把 PSN、Xbox、Steam 的完成里程碑纳入个人时间线，保留真实解锁时间，并让定时同步在长期没有新奖杯时仍能推进检查点。

## What Changes

- 新增 PSN 奖杯、Xbox 成就和 Steam 成就同步来源，分别使用 `psn-api`、[OpenXbox/xbox-webapi-python](https://github.com/OpenXbox/xbox-webapi-python) 与 Steam 官方 Web API。
- Xbox 通过异步 `Bun.spawn` 按批调用 Python 采集器，使用标准输入输出交换 JSON；Python 负责授权与平台请求，Bun 保留里程碑计算、数据库、检查点和既有调度职责。
- 仅在接口能证明本体范围且能确定完成时间时生成本体里程碑；否则只生成有完整成就证据的全成就项。PSN 白金、Xbox Mythic 与 Steam 本体全成就使用各自真实名称。
- 每个平台、账号、游戏最多保留本体和全成就两类条目；同次完成合并展示，后续补完追加成就更新同一条全成就项及其创建时间，本体项保留。
- 使用平台实际解锁时间，不用同步时间代替；首次同步不猜测接口无法恢复的历史本体范围或历次全成就记录。
- 持久化每个奖杯来源的执行时间、成功检查点和游戏摘要。常规同步只对变化游戏及有界轮转复查对象拉取详情，允许 Steam 必要的轻量游戏目录扫描，不在每轮重拉全库成就详情。
- 增加共享成就展示 DTO 与统一卡片，展示游戏封面、名称、平台、里程碑和达成时的成就数量，适配现有深色与纸张主题。
- 每个同步任务填写自己的凭据。PSN 与 Xbox 省略目标账号时使用授权账号。Xbox 使用自有 OAuth 应用及 `xboxTokenStorePath` 指向的 Python OAuth JSON 会话，Steam 使用 `steamWebAPIKey` 与显式的 SteamID64。

## Capabilities

### New Capabilities

- `game-achievement-sync`: 三个平台的授权、证据判定、完成时间、幂等写入、独立检查点及增量发现。
- `game-achievement-display`: 安全的成就展示契约、合并后的查询一致性，以及跨主题、响应式里程碑卡片。

### Modified Capabilities

无。既有 `sync-operations` 的调度、一次执行限制与最近十次内存运行记录保持现有语义；奖杯检查点独立持久化。既有可见性、软删除、搜索与主题要求继续适用于新增条目。

## Impact

- 服务端：`server/src/types/config.ts`、`server/configs/server.example.ts`、`server/src/sync/`、新增的 `server/python/` 采集入口、数据库实体及 controller、`server/src/api/serializers.ts` 与统一时间线查询条件。
- 共享契约：新增来源枚举和成就 DTO；客户端新增对应卡片及平台标签，沿用现有附件、菜单、SWR 与静态导出方式。
- 依赖：JavaScript 仅增加 `psn-api`，Steam 继续使用已有 Axios；仅启用 Xbox 时需要 Python 运行环境及 Python 包 `xbox-webapi`，由独立虚拟环境和 `server/python/requirements.txt` 管理，不新增其他包管理器锁文件。
- 数据：新增奖杯同步状态与游戏快照；合并状态和管理员软删除分开记录，列表与总数使用同一过滤条件。不引入旧 schema 兼容或迁移层。
- 文档：维护配置、开发和部署指南，明确 Xbox OAuth 应用注册、会话获取、Python 虚拟环境准备、可见性要求和已验证的数据边界；仅使用 PSN 或 Steam 时不要求安装 Python。
