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

访问客户端的 `/?login` 打开登录窗口。管理员可以查看私密条目，并在工具面板使用以下功能。

- **同步**。手动触发所有已启用来源，查看当前进度及最近 10 次已结束的运行。成功任务显示新增或更新的条目数。
- **日志**。按级别、模块和消息关键词筛选，最新日志在前。内存中最多保留 500 条，每条消息最多 4096 字符，超长时标记截断。
- **访客预览**。切换到访客视角浏览公开内容。
- **退出登录**。清除登录 Cookie，回到公开时间线。也可访问客户端的 `/?logout`。

重启服务端会清空同步运行记录和日志。

## 同步来源

在 `server/configs/server.ts` 中导入 `SyncServiceType`，然后在 `services` 中添加来源。模板中已有可取消注释的示例。 [服务端配置模板](../server/configs/server.example.ts)

```ts
import { SyncServiceType } from "@timeline/contracts";
```

每个来源需要唯一且稳定的 `id`，以及对应的 `type`（如 `SyncServiceType.FEED`）。`label` 用作前端标签，`from` 可设置采集起始日期，`enabled: false` 会停用该来源。

| 来源               | `SyncServiceType` 成员       | 来源参数                                                    |
| ------------------ | ---------------------------- | ----------------------------------------------------------- |
| Bilibili 收藏夹    | `BILIBILI_COLLECTION`        | 收藏夹 ID `mediaId`                                         |
| Bilibili 作品      | `BILIBILI_WORK`              | 用户 ID `userId`                                            |
| RSS 或 Atom 订阅   | `FEED`                       | 订阅地址 `url`，`syntax` 默认为 `"atom"`，RSS 用 `"rss"`    |
| GitHub Issue 评论  | `GITHUB_ISSUE_COMMENT`       | 仓库所有者 `owner`、仓库名 `repo`、Issue 编号 `issueNumber` |
| QQ 空间说说        | `QZONE_TALK`                 | QQ 号 `qqNumber`                                            |
| Steam 近期游戏时长 | `STEAM_RECENTLY_PLAYED_TIME` | Steam ID `steamId`                                          |
| Steam 游戏评测     | `STEAM_GAME_REVIEW`          | Steam 社区自定义地址 `/id/<userId>/` 中的 `userId`          |

GitHub 来源需要在服务端配置顶层填写可访问目标仓库的 `githubPersonalAccessToken`。 [GitHub 令牌指南](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)

Steam 近期游戏时长来源需要在服务端配置顶层填写 `steamWebAPIKey`。 [Steam API 密钥](https://steamcommunity.com/dev/apikey)

QQ 空间来源需要扫码授权。以管理员身份登录客户端后，在同一浏览器访问服务端的 `/qzone-login?qqNumber=<QQ号>`，扫码并确认登录。完成后可手动触发同步，也可等待下一次定时同步。QQ 空间视频切片使用 `ffmpeg-static`。

## 同步频率

全局 `syncInterval` 默认为 `*/30 * * * *`，即每小时的第 0 和第 30 分钟。单个来源可用同名字段覆盖，例如 `0 * * * *` 表示每小时整点同步。

同一时刻到期的来源合并为一轮。已有同步运行时，新的定时触发会跳过。启动和手动同步覆盖所有已启用来源。
