# 部署指南

Timeline 由静态客户端和 Bun 服务端组成。部署前准备 PostgreSQL 生产库与两端配置。 [配置指南](configuration.md)

## 客户端

将 `client/configs/client.ts` 的 `server.baseURL` 设置为浏览器可访问的 API 地址。启用管理员登录时，将客户端和 API 部署在同一站点，以便浏览器发送登录 Cookie。

在仓库根目录构建。

```sh
bun install --frozen-lockfile
bun run build:client
```

将 `client/out/` 发布到静态托管服务。可在本地运行 `bun run start:client` 预览构建产物。

## 服务端

按仓库相对路径保留根目录的 `package.json`、`bun.lock`、`bunfig.toml`、`tsconfig.base.json`、各 workspace 的 `package.json`，以及 `server/tsconfig.json`、`server/src/` 和 `packages/contracts/src/`。在目标平台从仓库根目录安装服务端的生产依赖。

```sh
bun install --production --frozen-lockfile --filter '@timeline/server...'
```

保留根 `node_modules/.bun/` 和各 workspace 的依赖链接。安装时由 `ffmpeg-static` 下载目标平台的二进制文件。

提供 `server/configs/server.ts`，保留或挂载 `server/.static/` 中的媒体，以及 `server/.temporary/` 中的缓存和会话。在仓库根目录启动服务端。

```sh
bun run start:server
```

如需在启动时全量同步，在进程环境中设置 `FULL_SYNC=true` 后执行同一命令。该轮对增量采集的来源忽略上次同步时间，仍保留 `from` 设置的下限。后续按各来源生效的 `syncInterval` 定时同步。

## Xbox Python 环境

仅启用 `XBOX_GAME_ACHIEVEMENT` 时需要 Python 3.12+ 和 `uv`。在目标平台部署 `server/python/`，创建 `server/.venv` 并安装 `server/python/requirements.txt`，命令见[开发指南](development.md#游戏成就采集)。Windows 解释器位于 `Scripts/python.exe`，Linux 位于 `bin/python`；服务端按 server 根目录定位，与启动目录无关。不要从另一台机器复制虚拟环境。

首次登录按[配置指南](configuration.md#xbox)注册自有 OAuth Web 应用，回调 URI 与端口保持一致。保护并持久挂载各 Xbox 任务的 `xboxTokenStorePath` 指向的 OAuth JSON 文件，允许进程在其目录内写临时文件并原子替换；不要把应用密钥放进进程命令行。多来源共用会话会串行调用采集器，服务退出会等待同步任务，超时会终止并回收 Python 子进程。

发布前备份数据库并同时更新服务端、共享契约和静态客户端。新增来源状态与游戏快照由当前 TypeORM `synchronize` 建立；保持既有媒体、会话和数据库数据。当前已验证 Windows；Linux 路径按平台构造，未在 Linux 主机实测。
