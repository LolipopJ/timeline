# 开发指南

按 [快速开始](../README.md#快速开始) 安装依赖并准备配置。依赖安装和锁文件维护均在仓库根目录进行。

## 工作区

| 目录                  | 职责                                                                |
| --------------------- | ------------------------------------------------------------------- |
| `client/`             | Next.js 静态客户端                                                  |
| `server/`             | Elysia API、PostgreSQL 存储和来源同步                               |
| `packages/contracts/` | 无框架依赖的 HTTP DTO 和枚举，供两端通过 `@timeline/contracts` 共享 |

## 开发命令

在仓库根目录运行以下命令。客户端默认端口为 `3000`，服务端默认端口为 `4000`。

| 命令                                             | 用途                          |
| ------------------------------------------------ | ----------------------------- |
| `bun run dev`                                    | 同时启动客户端和服务端        |
| `bun run dev:client`                             | 仅启动客户端                  |
| `bun run dev:server`                             | 仅启动服务端                  |
| `bun run lint:client`                            | 检查客户端                    |
| `bun run lint:server`                            | 检查服务端和共享契约          |
| `bun run lint:contracts`                         | 检查共享契约                  |
| `bun run --filter @timeline/client typecheck`    | 生成 Next.js 类型并检查客户端 |
| `bun run --filter @timeline/server typecheck`    | 检查服务端类型                |
| `bun run --filter @timeline/contracts typecheck` | 检查共享契约类型              |

需要自动修复时，使用对应的 `lint:client:fix`、`lint:server:fix` 或 `lint:contracts:fix`。也可在 `client/` 或 `server/` 目录运行各自的 `bun run dev`。

仓库协作与变更验证规则见 [AGENTS.md](../AGENTS.md)。

## 游戏成就采集

PSN 使用 `psn-api`，Steam 使用已有 Axios；只启用这些来源无需 Python。Xbox 使用 Python 3.12+，从仓库根目录通过 `uv` 准备本机环境，不提交或跨平台复制虚拟环境。

```powershell
uv venv --python 3.12 server/.venv
uv pip install --python server/.venv/Scripts/python.exe -r server/python/requirements.txt
uv pip check --python server/.venv/Scripts/python.exe
server/.venv/Scripts/python.exe -m unittest discover -s server/python -p "test_*.py"
```

Linux 将解释器路径换成 `server/.venv/bin/python`。`requirements.txt` 固定 Xbox 库和 HTTP 代理支持，Python 不新增包管理器锁文件。首次 OAuth 授权参见[配置指南](configuration.md#xbox)。

在 `server/` 运行 `bun test src/sync/achievement.test.ts src/sync/psn.test.ts src/sync/xbox.test.ts src/sync/steam-achievement.test.ts`。数据库回归使用开发库，PowerShell 先设置 `$env:NODE_ENV = "development"`，再执行 `bun test src/database/game-achievement.test.ts`；该用例只创建并清理带随机测试标识的记录，不启动服务端同步。浏览器回归在根目录先执行 `bun run build:client`，再执行 `node node_modules/@playwright/test/cli.js test`。
