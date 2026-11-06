# Timeline

Timeline 将不同平台的内容同步到一条个人时间线，支持搜索和按来源筛选。可同步 Bilibili 收藏和作品、RSS 与 Atom 订阅、GitHub Issue 评论、QQ 空间说说、Steam 评测，以及 PSN 白金和 PSN、Xbox、Steam 的全成就里程碑。

## 快速开始

准备 Node.js 24.22.0 或更高版本、Bun 1.4.4 或更高版本和 PostgreSQL 数据库。在仓库根目录安装依赖并复制配置。

```sh
bun install --frozen-lockfile
cp config.example.yaml config.yaml
```

在 `config.yaml` 中填写 `server.database`。手动创建开发环境数据库，库名为配置的数据库名加 `_dev`（例如对于配置的数据库 `timeline`，开发环境下会连接数据库 `timeline_dev`）。按需配置管理员和同步来源，然后启动。

```sh
bun run dev
```

启动后打开 [http://127.0.0.1:3000](http://127.0.0.1:3000)。

## 文档

- [配置指南](docs/configuration.md)
- [开发指南](docs/development.md)
- [部署指南](docs/deployment.md)
- [搜索与分享指南](docs/search.md)
