# Timeline

## Preparation / Configuration

分别复制 `config/client-template.ts` 和 `config/server-template.ts` 为 `config/client.ts` 和 `config/server.ts`，配置您的客户端和服务端。

### Bun

本项目基于 Bun 开发，您需要全局安装 Bun：

```bash
npm install -g bun
```

### PostgreSQL

本项目依赖于 PostgreSQL 数据库。

编辑 `config/server.ts`，填写连接到 PostgreSQL 数据库的配置信息：

```ts
export const serverConfig: ServerConfig = {
  database: {
    user: 'your_postgresql_user',
    password: 'your_postgresql_password',
    host: '127.0.0.1',
    port: 5432,
    database: 'timeline',
  },
}
```

其中，数据库需要手动创建。例如使用 `psql` 工具创建名为 `timeline` 的数据库：

```sql
CREATE DATABASE timeline;
```

### Github Issue Comment

需要提供 Github Personal Access Token（[在此创建](https://github.com/settings/tokens/new?scopes=repo)）：

```ts
export const serverConfig: ServerConfig = {
  githubPersonalAccessToken: 'ghp_yourGithubPersonalAccessToken',
}
```

添加需要同步评论的 Issue：

```ts
export const serverConfig: ServerConfig = {
  services: [
    {
      type: SyncServiceType.GITHUB_ISSUE_COMMENT,
      id: 'GithubIssueComments',
      label: 'My Github Issue Comments',
      owner: 'github_repo_owner',
      repo: 'github_repo_name',
      issueNumber: 1,
    },
  ],
}
```

### Other Configurations

```ts
export const serverConfig: ServerConfig = {
  /** 服务端监听端口 */
  listeningPort: 4000,
  /** 同步 Timeline 信息的 Cron 规则；这里表示每 30 分钟执行一次同步 */
  syncInterval: '*/30 * * * *',
}
```

## Deployment

### Client

```bash
bun --bun run build:client
bun --bun run start:client
```

### Server

```bash
bun run start:server
```

## Development

### Client

```bash
bun --bun run dev:client
```

### Server

```bash
bun run dev:server
```
