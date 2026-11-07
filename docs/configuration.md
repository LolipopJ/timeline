# 配置指南

将 [配置模板](../config.example.yaml) 复制为仓库根目录的 `config.yaml`。此文件由 Git 忽略。

- `client` 保存站点信息和公开 API 地址。模板的 `client.apiBaseURL` 为 `http://127.0.0.1:4000`，同源部署可省略。修改 `client` 后需重新构建静态客户端，开发模式下需重启 Next.js。
- `server` 保存数据库连接、管理员凭据、平台令牌和同步来源。服务端默认监听 `4000`。可用 `server.allowedOrigin` 指定单个 HTTP(S) Origin（协议、主机和可选端口）。末尾的 `/` 会自动去除，省略或填 `true` 时允许所有来源。修改 `server` 后需重启服务端。

使用两个空格缩进。数字 ID、密码、Cron 表达式和日期都写成带引号的字符串，端口和 `issueNumber` 写成数字，开关使用 `true` 或 `false`。Windows 路径可使用单引号保留反斜杠。各节可省略未用到的可选字段。配置使用一份 YAML 文档，映射键按字符串处理且必须唯一。YAML 别名会被拒绝。

## 数据库

在 `server.database` 中填写 `user`、`password`、`host`、`port` 和数据库名 `database`。服务端启动时会同步表结构，数据库本身需手动创建。开发模式在数据库名后追加 `_dev`，生产模式使用配置中的名称。

以下示例使用模板的库名。按运行环境选择对应的语句。

```sql
-- 开发
CREATE DATABASE timeline_dev;

-- 生产
CREATE DATABASE timeline;
```

## 管理员

启用管理员时取消模板中 `server.admin` 整段的注释，填写自己的 JWT 密钥 `secretKey`，并在 `accounts` 中填写各账号的 `username` 和 `password`。默认提供公开访问。

访问客户端的 `/?login` 打开登录窗口。管理员可以查看私密条目。点击右下角的管理图标打开管理面板，点击面板外部空白处、关闭按钮或按 Esc 可关闭面板。

- **同步**。手动触发所有已启用来源。通过「同步任务」下拉菜单查看「全部任务」或按 `标签(服务 ID)` 查看单个来源。当前进程在内存中为全部任务和每个来源分别保留最近 10 次已结束的运行，成功结果显示新增或更新的条目数。
- **日志**。按级别、模块和消息关键词筛选，最新日志在前。内存中最多保留 500 条，每条消息最多 4096 字符，超长时标记截断。
- **访客预览**。使用模式按钮切换视角。按钮采用主题色图标，随当前视角显示“管理员模式”或“访客预览”。切换时保留登录会话与搜索筛选条件。
- **退出登录**。在管理员模式下打开管理面板，点击退出登录，清除登录 Cookie，回到公开时间线。也可访问客户端的 `/?logout`。

主题与模式按钮在 md（768px）及以上显示图标和文字，在 sm（640px）到 md 之间显示图标按钮。sm 到 lg（1024px）之间，两个按钮与三点菜单位于同一横排。小于 sm 时，两个按钮收进时间线菜单，显示为无边框的图标加文字操作项。

重启服务端会清空同步运行记录和日志。

## 同步来源

在 `server.services` 列表中添加来源。空列表写为 `services: []`。启用模板中的来源时，移除 `[]` 并取消对应条目的注释。

每个来源需要唯一且稳定的 `id` 和对应的 `type`。`label` 用作前端标签，省略时使用 `id`。搜索会合并使用同一标签的来源。`enabled: false` 停用该来源，`secret: true` 将新同步内容设为仅管理员可见。`from` 可填写 UTC 零点的日期（如 `"2026-01-01"`）或带时区的 ISO 时间（如 `"2026-01-01T00:00:00+08:00"`）。

| 来源 | `type` | 来源参数 |
| --- | --- | --- |
| Bilibili 收藏夹 | `BilibiliCollection` | 收藏夹 ID `mediaId` |
| Bilibili 作品 | `BilibiliWork` | 用户 ID `userId` |
| RSS 或 Atom 订阅 | `Feed` | 订阅地址 `url`，`syntax` 默认为 `"atom"`，RSS 用 `"rss"` |
| GitHub Issue 评论 | `GithubIssueComment` | `owner`、`repo`、`issueNumber` 和 `githubPersonalAccessToken` |
| QQ 空间说说 | `QZoneTalk` | QQ 号 `qqNumber` |
| Steam 近期游戏时长 | `SteamRecentlyPlayedTime` | `steamId`（SteamID64）、`steamWebAPIKey` |
| Steam 游戏评测 | `SteamGameReview` | Steam 社区自定义地址 `/id/<userId>/` 中的 `userId` |
| PSN 奖杯 | `PsnGameAchievement` | `psnNpsso`、可选的数字账号 ID `accountId` |
| Xbox 成就 | `XboxGameAchievement` | `xboxClientId`、`xboxClientSecret`、`xboxTokenStorePath`、可选的数字用户 ID `xuid` |
| Steam 成就 | `SteamGameAchievement` | `steamId`（SteamID64）、`steamWebAPIKey` |
| FF14 绝境战 | `FfxivUltimateAchievement` | Lodestone 角色 ID `characterId` |

Bilibili 作品同步通过匿名会话读取指定用户的公开投稿和列表简介。Bilibili 的列表接口可能截断较长的简介。

凭据填写在使用它的 `services` 项中。多个任务使用同一凭据时，每个任务都要填写。

GitHub 令牌需要能访问目标仓库，任务同步该令牌所属账号的评论。`owner` 是仓库所有者。 [GitHub 令牌指南](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)

Steam 近期游戏时长和 Steam 成就都需要 `steamWebAPIKey` 与目标账号的 SteamID64。 [Steam API 密钥](https://steamcommunity.com/dev/apikey)

QQ 空间来源需要扫码授权。以管理员身份登录客户端后，在同一浏览器访问服务端的 `/qzone-login?qqNumber=<QQ号>`，扫码并确认登录。完成后可手动触发同步，也可等待下一次定时同步。QQ 空间视频切片使用 `ffmpeg-static`。

## FF14 绝境战踏破

在 `server.services` 中添加以下来源，以角色 `36150060` 为例。角色的 Lodestone 成就需要设为公开。

```yaml
- type: "FfxivUltimateAchievement"
  id: "MyFfxivUltimateAchievements"
  label: "FF14 绝境战"
  characterId: "36150060"
```

每轮依次检查七个固定成就的公开详情页，读取达成状态、原始完成时间、成就名和报酬称号。七页全部读取成功后，一次写入已踏破且符合 `from` 下限的条目。尚未达成的成就会在后续同步中继续检查。页面不可读、成就非公开或已达成条目缺少有效时间时，本轮任务报告失败。

每项踏破使用角色 ID 与成就 ID 组成唯一内容标识。重复同步保留原条目及管理员调整过的私密、删除状态。时间线按官方完成时间归档，卡片按浏览器时区显示时间，并提供对应的 Lodestone 详情链接。

卡片展示中文绝境战名称、英文缩写、Lodestone 原文成就名、英文报酬称号和踏破时间，使用对应战斗角色的官方艺术图、细线纹理及悬浮和键盘聚焦效果。图片以 WebP 随静态客户端打包。减少动态效果偏好会关闭位移动效。

| 成就 ID | 绝境战 | 官方战斗介绍 |
| --- | --- | --- |
| `1993` | 巴哈姆特绝境战 | [官方 4.11 更新说明](https://na.finalfantasyxiv.com/lodestone/topics/detail/aee832c2c57456a26f36531c78380e74202d0d75) |
| `2107` | 究极神兵绝境战 | [官方 4.31 更新说明](https://na.finalfantasyxiv.com/lodestone/topics/detail/661a0c5168742c1b2c1bacb42af5736902d63c36) |
| `2444` | 亚历山大绝境战 | [官方 5.11 更新说明](https://na.finalfantasyxiv.com/lodestone/topics/detail/879013bc3883733ae78f8ad1ca6cf3784b6fda9f) |
| `3074` | 幻想龙诗绝境战 | [官方 6.11 更新说明](https://na.finalfantasyxiv.com/lodestone/topics/detail/f525c780b9abdb74c5b664f799dd16ff9de9c7b1) |
| `3162` | 欧米茄绝境验证战 | [官方 6.31 更新说明](https://na.finalfantasyxiv.com/lodestone/topics/detail/8eebddf71a43266f45fba4c27b78853be2801343/) |
| `3617` | 光暗未来绝境战 | [官方 7.1 宣传页](https://na.finalfantasyxiv.com/dawntrail/patch_7_1/) |
| `4069` | 妖星乱舞绝境战 | [官方 7.5 宣传页](https://na.finalfantasyxiv.com/dawntrail/patch_7_5/) |

七张官方艺术图的出处与静态文件见 [素材说明](ffxiv-ultimate-art.md)。图片归 SQUARE ENIX 所有，卡片保留 `© SQUARE ENIX` 标注。 [FF14 素材使用规范](https://support.na.square-enix.com/rule.php?id=5382&la=1&tag=authc)

## 游戏完成里程碑

在 `server.services` 的每个成就任务中填写相应的授权字段。三个平台可分别启停、设置 `syncInterval` 和 `from`，也可通过现有管理员工具手动同步。

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

本体成就优先使用 Steam 公开成就页上明确分组的本体集合，按 API ID 与 Web API 的完整定义核对。Steam 将所有成就放在同一个默认组时，可在 `gameOverrides` 为该游戏提供经过核验的本体成就数量 `baseAchievementCount`，按 `GetSchemaForGame` 定义顺序取前 N 项作为本体集合。全成就始终按 Web API 的完整定义与实际解锁时间计算。 [Steam 成就集](https://partner.steamgames.com/doc/features/achievements/ach_guide?l=english#achievement_sets)

```yaml
gameOverrides:
  123456: {}
  234567:
    baseAchievementCount: 54
```

### 范围、重查与历史

首次建立可枚举游戏的详情基线，后续读取轻量目录，只核验新增、摘要变化和每轮最多 5 个轮转游戏。轮转位置持久保存，包含当前目录中的已完成游戏。已移出目录的游戏保留历史记录。无游玩变化的迟到解锁与新增成就可能需要多个成功轮次才能被发现。`full: true` 或管理员全量同步会重新核验本轮可枚举的全部游戏。`from` 限制里程碑的创建日期，判定完成仍使用完整的解锁记录。

每个来源、平台、账号、游戏最多保存本体和全成就两个位置。同次完成有证据时合并展示，之后补完追加成就更新原全成就项，保留本体日期；追加成就尚未完成时保留历史，不表达为当前进度。管理员私密和软删除状态不会被同步覆盖。成功零事件也会持久保存检查点；失败和不完整结果不会推进检查点。不推测接口无法恢复的历次完成历史。

## 同步频率

全局 `server.syncInterval` 默认为 `*/30 * * * *`，即每小时的第 0 和第 30 分钟。单个来源可用同名字段覆盖，例如 `0 * * * *` 表示每小时整点同步。

同一时刻到期的来源合并为一轮。已有同步运行时，新的定时触发会跳过。启动和手动同步覆盖所有已启用来源。
