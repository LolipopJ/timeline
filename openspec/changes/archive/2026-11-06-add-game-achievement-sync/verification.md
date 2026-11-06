# Verification

## Results

2026-11-05 在 Windows、Bun 1.4.4、Python 3.12.15 上验证。Python 环境由 `uv` 管理，依赖为 `xbox-webapi==2.1.0` 与 `httpx[socks]==0.28.1`。未启动生产同步，数据库检查使用配置对应的 `_dev` 库。

| 检查                                                                                                                                                                  | 实际结果                                                 |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `bun run lint:server`、`bun run lint:client`                                                                                                                          | 通过                                                     |
| 三个 workspace 的 `typecheck`                                                                                                                                         | 通过                                                     |
| `bun run build:client`                                                                                                                                                | 静态导出通过                                             |
| `bun test src/sync/achievement.test.ts src/sync/psn.test.ts src/sync/xbox.test.ts src/sync/steam-achievement.test.ts src/sync/coordinator.test.ts`，在 `server/` 执行 | 20 项通过                                                |
| `NODE_ENV=development` 下执行 `bun test src/database/game-achievement.test.ts`                                                                                        | 2 项开发库回归通过                                       |
| `bun test src/admin.test.ts`、`bun test src/sync/qzone.test.ts`                                                                                                       | 分别 10 项、2 项通过                                     |
| `uv pip check --python server/.venv/Scripts/python.exe`                                                                                                               | 通过                                                     |
| `server/.venv/Scripts/python.exe -m unittest discover -s server/python -p "test_*.py"`                                                                                | 13 项中 12 项通过、1 项跳过                              |
| `node node_modules/@playwright/test/cli.js test --grep 'achievement cards'`                                                                                           | 桌面与 360px 两项通过                                    |
| `node node_modules/@playwright/test/cli.js test`                                                                                                                      | 66/68 通过；两项既有 Bilibili 文字色断言失败，见下方说明 |
| `openspec validate add-game-achievement-sync --strict --json`                                                                                                         | 通过                                                     |
| Markdown 格式检查、`git diff --check`                                                                                                                                 | 通过                                                     |
| 对修改差异及新增文件检查已配置凭据                                                                                                                                    | 未发现真实凭据                                           |

开发库回归验证零事件成功检查点、重启恢复、写入失败回滚、合并列表与数量、按 ID 隐私过滤、软删除后补完、历史数量保留、同秒追加解锁、持久化轮转发现旧解锁、`from/full` 以及三来源手动与定时执行时的失败隔离。子进程用例覆盖异常退出、错误和不完整 JSON、超时回收、脱敏诊断以及同会话串行和失败释放。

## Platform Evidence

使用本地服务端授权完成一次三平台并行的真实首次基线，经过采集器、公共里程碑计算及开发库事务。没有把授权值、账号名称或原始平台返回写入此记录。

| 平台  | 完整目录及详情   | 写入逻辑条目 | 成功检查点 |
| ----- | ---------------- | ------------ | ---------- |
| PSN   | 67 个奖杯集合    | 22           | 已持久化   |
| Xbox  | 9 款现代游戏     | 1            | 已持久化   |
| Steam | 170 款可枚举游戏 | 10           | 已持久化   |

共保存 246 份游戏快照。验证完成后只清理本轮带随机调试标识的条目、快照和状态；保留刷新的私有授权会话。PS4 与 PS5 的白金类型及实际日期、Xbox 现代成就日期、Steam 完整成就和无统计游戏的空响应均取得真实样本核对。

Xbox 样本及 Steam 官方 `GetSchemaForGame` 样本均未提供可证明本体归属的分组字段，因此采集器只产出全成就证据。共用模型的明确本体集合判定和 Mythic 卡片使用最小归一化用例验证，不宣称在真实账号上取得 Mythic。来源依据：[Steam Web API](https://partner.steamgames.com/doc/webapi/ISteamUserStats)、[Achievement Sets](https://partner.steamgames.com/doc/features/achievements/ach_guide?l=english)、[OpenXbox](https://github.com/OpenXbox/xbox-webapi-python)。

## Limits

- 完整 Playwright 套件的两处失败均为 `archive joins pages within a month and follows the sorted reading position` 的桌面与移动用例。断言要求 Bilibili 封面标题颜色为 `rgb(255, 255, 255)`，实际为主题前景色 `rgb(231, 236, 234)`。已核对 Git HEAD：该组件原有 `text-foreground`、主题变量 `--foreground: #e7ecea` 与白色断言均已存在；本次没有改动对应组件或全局样式。成就专用用例通过，保留这一无关失败记录。
- 已人工查看桌面纸张与移动深色截图，浏览器用例检查两种主题、长标题换行、封面失败占位、键盘焦点、来源和游戏名筛选、私密分享空结果及减少动态效果偏好。
- 当前账号没有 Xbox360 游戏，真实现代 Xbox 详情也未超过一页；这些分页分支通过可核对的 provider 字段样本回归验证，未宣称完成对应真实账号验证。
- Windows 无创建符号链接权限，相关 Python 用例因系统错误 1314 跳过；路径解析和原子替换实现已覆盖，未实测该符号链接场景。Linux 环境不可用，未实测 Linux 运行与退出。

## Review Follow-up

2026-11-06 复核修复了目录移除后的轮转、同秒补报的历史成就证据、PSN 奖杯集版本一致性、Steam 与 Xbox 的无效日期，以及 Xbox 封面、外链和缺依赖诊断。按更新时间排序时，成就卡片会显示实际达成日期。Bilibili 封面标题的断言已改为对应的主题前景色。

两端 lint、类型检查和静态构建通过。Playwright 完整套件 68/68 通过。Bun 同步回归 20 项及开发库回归 2 项通过。Python 14 项中 13 项通过，Windows 符号链接用例仍因权限跳过。使用两类 PSN 奖杯服务的真实返回抽查了新增的版本检查。

## Steam Recheck

2026-11-06 用真实 Steam 任务在开发库全量核验 171 款游戏，写入并回读以下三条里程碑。所有时间均为 UTC。

| AppID     | 里程碑     | 达成数量 | 实际达成时间           |
| --------- | ---------- | -------- | ---------------------- |
| `1903340` | 全成就     | 55/55    | `2025-05-04T07:57:20Z` |
| `3681010` | 本体全成就 | 51/51    | `2026-02-08T20:06:52Z` |
| `881020`  | 本体全成就 | 54/54    | `2024-02-21T06:16:56Z` |

`1903340` 通过任务配置补入 `GetOwnedGames` 未列出的 AppID。`3681010` 的 Steam 公开成就页明确区分 51 项本体与 13 项 DLC，API ID 与 Web API 定义吻合。`881020` 的公开页仍只有一个包含 96 项的默认组。本机任务中的本体清单使用 Steam 在资料片发售前授予 `Platinum Sky` 时已解锁的 54 个 API ID。 [Steam 公开成就页说明](https://partner.steamgames.com/doc/features/achievements/ach_guide?l=english#what_players_see)

服务端类型检查、lint、13 项 Steam 与成就持久化 Bun 回归及 OpenSpec 严格校验通过。
