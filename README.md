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

开发环境下将使用添加 `_dev` 后缀名的数据库。因此，如果您需要进行二次开发，还应当创建名为 `timeline_dev` 的数据库：

```sql
CREATE DATABASE timeline_dev;
```

### Bilibili Collections

添加需要同步的 Bilibili 收藏夹：

```ts
export const serverConfig: ServerConfig = {
  services: [
    {
      type: SyncServiceType.BILIBILI_COLLECTION,
      id: 'MyBilibiliCollections',
      label: 'My Bilibili Collections',
      mediaId: '75618059',
    },
  ],
}
```

### Feed

添加需要同步的站点 Feed：

```ts
export const serverConfig: ServerConfig = {
  services: [
    {
      type: SyncServiceType.FEED,
      id: 'MyBlog',
      label: 'My Blog Articles',
      syntax: 'atom',
      url: 'https://blog.example.com/atom.xml',
    },
  ],
}
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

### QQ Zone Talks

同步 QQ 空间说说依赖 **[ffmpeg](https://www.ffmpeg.org/)** 对视频文件进行切片，请确保系统运行内存足够，避免异常跳出。

添加需要同步的空间，例如：

```ts
export const serverConfig: ServerConfig = {
  services: [
    {
      type: SyncServiceType.QZONE_TALK,
      id: 'MyQQZone',
      label: 'My QQ Zone',
      qqNumber: '408550000',
      from: new Date('2018-01-01'),
    },
  ],
}
```

获取远程接口所需的 Cookies 信息，访问服务端的 `/qzone-login?qqNumber=408550000` 路由，扫码并确认登录到 QQ 空间。

确认登录后，重启服务端或是等待下一次同步事务即可。

### Other Configurations

```ts
export const serverConfig: ServerConfig = {
  /** 服务端监听端口 */
  listeningPort: 4000,
  /** 同步 Timeline 信息的 Cron 规则；这里表示每小时的 0 和 30 分钟执行一次同步操作 */
  syncInterval: '*/30 * * * *',
}
```

## Development

### Client

```bash
bun run dev:client
```

### Server

```bash
bun run dev:server
```

## Deployment

### Client

编辑客户端配置后，需要手动构建方可生效。

```bash
bun run build:client
```

### Server

```bash
bun run start:server
```
