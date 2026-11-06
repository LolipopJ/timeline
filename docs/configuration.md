# 配置指南

按 [快速开始](../README.md#快速开始) 复制两份配置。

- `client/configs/client.ts` 保存站点信息和 API 地址。模板中的 `server.baseURL` 为 `http://127.0.0.1:4000`。客户端配置随构建公开，修改 API 地址后需重新构建。
- `server/configs/server.ts` 保存数据库连接、管理员凭据、平台令牌和同步来源。服务端默认监听 `4000`，跨源访问时可通过 `allowedOrigin` 指定客户端的 Origin。

## 数据库

在 `database` 中填写 `user`、`password`、`host`、`port` 和数据库名 `database`。服务端启动时会同步表结构，数据库本身需手动创建。开发模式在数据库名后追加 `_dev`，生产模式使用配置中的名称。

以下示例使用模板的库名。按运行环境选择对应的语句。

```sql
-- 开发
CREATE DATABASE timeline_dev;

-- 生产
CREATE DATABASE timeline;
```

## 管理员

将 `admin.secretKey` 和 `admin.accounts` 中的示例值换成自己的 JWT 密钥与账号密码。账号通过 `username` 和 `password` 配置。仅提供公开访问时可移除 `admin`。

访问客户端的 `/?login` 打开登录窗口。管理员可以查看私密条目。点击右下角的管理图标打开管理面板，点击面板外部空白处、关闭按钮或按 Esc 可关闭面板。

- **同步**。手动触发所有已启用来源，查看当前进度及最近 10 次已结束的运行。成功任务显示新增或更新的条目数。
- **日志**。按级别、模块和消息关键词筛选，最新日志在前。内存中最多保留 500 条，每条消息最多 4096 字符，超长时标记截断。
- **访客预览**。使用模式按钮切换视角。按钮采用主题色图标，随当前视角显示“管理员模式”或“访客预览”。切换时保留登录会话与搜索筛选条件。
- **退出登录**。在管理员模式下打开管理面板，点击退出登录，清除登录 Cookie，回到公开时间线。也可访问客户端的 `/?logout`。

主题与模式按钮在 md（768px）及以上显示图标和文字，在 sm（640px）到 md 之间显示图标按钮。sm 到 lg（1024px）之间，两个按钮与三点菜单位于同一横排。小于 sm 时，两个按钮收进时间线菜单，显示为无边框的图标加文字操作项。

重启服务端会清空同步运行记录和日志。

## 同步来源

在 `server/configs/server.ts` 中导入 `SyncServiceType`，然后在 `services` 中添加来源。模板中已有可取消注释的示例。 [服务端配置模板](../server/configs/server.example.ts)

```ts
import { SyncServiceType } from "@timeline/contracts";
```

每个来源需要唯一且稳定的 `id`，以及对应的 `type`（如 `SyncServiceType.FEED`）。`label` 用作前端标签，`from` 可设置采集起始日期，`enabled: false` 会停用该来源。

| 来源               | `SyncServiceType` 成员       | 来源参数                                                                           |
| ------------------ | ---------------------------- | ---------------------------------------------------------------------------------- |
| Bilibili 收藏夹    | `BILIBILI_COLLECTION`        | 收藏夹 ID `mediaId`                                                                |
| Bilibili 作品      | `BILIBILI_WORK`              | 用户 ID `userId`                                                                   |
| RSS 或 Atom 订阅   | `FEED`                       | 订阅地址 `url`，`syntax` 默认为 `"atom"`，RSS 用 `"rss"`                           |
| GitHub Issue 评论  | `GITHUB_ISSUE_COMMENT`       | `owner`、`repo`、`issueNumber` 和 `githubPersonalAccessToken`                      |
| QQ 空间说说        | `QZONE_TALK`                 | QQ 号 `qqNumber`                                                                   |
| Steam 近期游戏时长 | `STEAM_RECENTLY_PLAYED_TIME` | `steamId`（SteamID64）、`steamWebAPIKey`                                           |
| Steam 游戏评测     | `STEAM_GAME_REVIEW`          | Steam 社区自定义地址 `/id/<userId>/` 中的 `userId`                                 |
| PSN 奖杯           | `PSN_GAME_ACHIEVEMENT`       | `psnNpsso`、可选的数字账号 ID `accountId`                                          |
| Xbox 成就          | `XBOX_GAME_ACHIEVEMENT`      | `xboxClientId`、`xboxClientSecret`、`xboxTokenStorePath`、可选的数字用户 ID `xuid` |
| Steam 成就         | `STEAM_GAME_ACHIEVEMENT`     | `steamId`（SteamID64）、`steamWebAPIKey`                                           |

凭据填写在使用它的 `services` 项中。多个任务使用同一凭据时，每个任务都要填写。

GitHub 令牌需要能访问目标仓库，任务同步该令牌所属账号的评论。`owner` 是仓库所有者。 [GitHub 令牌指南](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)

Steam 近期游戏时长和 Steam 成就都需要 `steamWebAPIKey` 与目标账号的 SteamID64。 [Steam API 密钥](https://steamcommunity.com/dev/apikey)

QQ 空间来源需要扫码授权。以管理员身份登录客户端后，在同一浏览器访问服务端的 `/qzone-login?qqNumber=<QQ号>`，扫码并确认登录。完成后可手动触发同步，也可等待下一次定时同步。QQ 空间视频切片使用 `ffmpeg-static`。

## 游戏完成里程碑

在本地 `server/configs/server.ts` 的每个成就任务中填写相应的授权字段。三个平台可分别启停、设置 `syncInterval` 和 `from`，也可通过现有管理员工具手动同步。

| 字段                               | 需要填写的内容                                                                                                                                       |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `psnNpsso`                         | PSN 首次授权的 NPSSO，按 [psn-api 授权指南](https://psn-api.achievements.app/authentication/authenticating-manually) 在已登录的浏览器中获取。        |
| `xboxClientId`、`xboxClientSecret` | 按 [OpenXbox 指南](https://github.com/OpenXbox/xbox-webapi-python#authentication) 注册自有 Microsoft OAuth Web 应用的 ID 与 secret，必须与会话匹配。 |
| `xboxTokenStorePath`               | `xbox-webapi` 的 `OAuth2TokenResponse` JSON 文件绝对路径，包含 OAuth access/refresh token；只接受这一种会话格式。                                    |
| `steamWebAPIKey`                   | 获取 [Steam Web API Key](https://steamcommunity.com/dev/apikey)。                                                                                    |

### PSN

首次使用某个 `psnNpsso` 时会交换授权，并将刷新会话写入私有的 `server/.temporary/psn-session-<凭据哈希>.json`。使用同一凭据的任务共享会话，后续同步与重启会复用它。会话失效时，重新取得 NPSSO 并替换对应任务的配置。部署时保留 `.temporary`。

省略 `accountId` 时，任务会查询 NPSSO 所属的账号。同步其他账号时，填写有权查看其奖杯的目标账号数字 ID。首次枚举所有可见奖杯集合；PS4/PS5 和区域集合按服务标识与集合 ID 分开保存。白金使用真实白金奖杯时间，全成就核验全部奖杯组。缺少时间的解锁不以同步时间补齐。PSN 接口没有可直接分享的游戏页面 URL 时，卡片不提供游戏外链。 [psn-api 奖杯接口](https://psn-api.achievements.app/api-docs/user-trophies)

### Xbox

Xbox 应用允许个人 Microsoft 账号，注册 Web 回调 `http://localhost:8080/auth/callback`。授权时由库请求 `Xboxlive.signin` 与 `Xboxlive.offline_access` 并取得用户同意，无需在 Azure 门户添加另一项 Xbox API 权限。使用 Python 3.12+ 与 `uv` 在服务器准备独立环境：

```powershell
uv venv --python 3.12 server/.venv
uv pip install --python server/.venv/Scripts/python.exe -r server/python/requirements.txt
```

首次授权在临时进程环境设置 `CLIENT_ID`、`CLIENT_SECRET` 和 `REDIRECT_URI=http://localhost:8080/auth/callback`，通过本地安全输入填写应用凭据，不把 secret 写入命令行或历史记录。然后运行 `server/.venv/Scripts/xbox-authenticate.exe --tokens "C:/path/to/timeline/server/.temporary/xbox.oauth.json" --port 8080`。CLI 会打开浏览器并接收回调；修改端口时必须同时修改注册 URI、`REDIRECT_URI` 和 `--port`。退出临时授权进程后，在服务端配置同一应用与该文件的绝对路径。会话只包含库生成的 OAuth JSON，不手工拼接或转换其他会话。

Linux 使用 `server/.venv/bin/python` 和 `server/.venv/bin/xbox-authenticate`。令牌与会话文件只保留在服务端或本地运行数据中，不写入示例、客户端或 Git 提交。正常同步不应打开浏览器或等待输入。

省略 `xuid` 时，任务会查询 OAuth 会话所属的 Xbox 账号。同步其他账号时，填写当前授权可读取的目标 Xbox 用户 ID。采集器刷新匹配应用的 OAuth 会话并原子写回原文件，同一会话文件的调用串行执行；应用与会话不匹配需要重新授权。摘要与成就详情都完整分页，支持现代 Xbox 和 Xbox360 的接口族。仅在启用 Xbox 时需要 Python。已验证的账号返回未提供可证明 Mythic 或本体范围的字段，因此当前采集只生成全成就项，不根据 Gamerscore 或名称推测本体。

### Steam

目标账号的游戏详情必须允许 Web API 读取，`steamId` 使用 SteamID64。同步范围包括 `GetOwnedGames` 返回的游戏，以及本任务 `gameOverrides` 中显式填写的 AppID。目录缺少曾经玩过的游戏时，可以用空对象补充该 AppID。私密或不完整的 Web API 解锁数据会使本轮失败并保留上次成功检查点。 [官方 Web API](https://partner.steamgames.com/doc/webapi/ISteamUserStats)

本体成就优先使用 Steam 公开成就页上明确分组的本体集合，按 API ID 与 Web API 的完整定义核对。Steam 将所有成就放在同一个默认组时，可在 `gameOverrides` 为该游戏提供经过核验的 `baseAchievementIds`。使用 `GetSchemaForGame` 中的 `name` 字段，保留大小写和前导零。全成就始终按 Web API 的完整定义与实际解锁时间计算。 [Steam 成就集](https://partner.steamgames.com/doc/features/achievements/ach_guide?l=english#achievement_sets)

```ts
gameOverrides: {
  123456: {},
  234567: { baseAchievementIds: ['ACH_STORY', 'ACH_FINAL'] },
},
```

### 范围、重查与历史

首次建立可枚举游戏的详情基线，后续读取轻量目录，只核验新增、摘要变化和每轮最多 5 个轮转游戏。轮转位置持久保存，包含当前目录中的已完成游戏。已移出目录的游戏保留历史记录。无游玩变化的迟到解锁与新增成就可能需要多个成功轮次才能被发现。`full: true` 或管理员全量同步会重新核验本轮可枚举的全部游戏。`from` 限制里程碑的创建日期，判定完成仍使用完整的解锁记录。

每个来源、平台、账号、游戏最多保存本体和全成就两个位置。同次完成有证据时合并展示，之后补完追加成就更新原全成就项，保留本体日期；追加成就尚未完成时保留历史，不表达为当前进度。管理员私密和软删除状态不会被同步覆盖。成功零事件也会持久保存检查点；失败和不完整结果不会推进检查点。不推测接口无法恢复的历次完成历史。

## 同步频率

全局 `syncInterval` 默认为 `*/30 * * * *`，即每小时的第 0 和第 30 分钟。单个来源可用同名字段覆盖，例如 `0 * * * *` 表示每小时整点同步。

同一时刻到期的来源合并为一轮。已有同步运行时，新的定时触发会跳过。启动和手动同步覆盖所有已启用来源。
