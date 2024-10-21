# Timeline

## Preparation / Configuration

分别复制 `config/client-template.ts` 和 `config/server-template.ts` 为 `config/client.ts` 和 `config/server.ts`，配置您的客户端和服务端。

### 【必要】Bun

本项目基于 Bun 开发，您需要全局安装 Bun：

```bash
npm install -g bun
```

### 【必要】数据库

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

### 管理员用户

当您以管理员用户登录到站点时，您可以访问所有服务端路由，看到您设为私密的时间线项。配置管理员用户：

```ts
export const serverConfig: ServerConfig = {
  admin: {
    secretKey: 'change_this_field_to_your_secret_key',
    accounts: [
      {
        username: 'admin_username',
        password: 'admin_password',
      },
    ],
  },
}
```

假设您的站点域名为 `www.timeline.com`，访问 `www.timeline.com?login` 即可唤起登录窗口，输入账号 `admin_username` 和密码 `admin_password` 即可以管理员身份登录到站点。

如果想退出登录，可以访问 `www.timeline.com?logout`，或手动清除站点的 Cookies。

### 同步 Bilibili 收藏夹

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

### 同步 Bilibili 作品

添加需要同步的 Bilibili 用户上传的创作：

```ts
export const serverConfig: ServerConfig = {
  services: [
    {
      type: SyncServiceType.BILIBILI_WORK,
      id: 'MyBilibiliWorks',
      label: 'My Bilibili Works',
      userId: '15487659',
    },
  ],
}
```

### 同步站点订阅

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

### 同步 Github 议题的评论

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

### 同步 QQ 空间说说

同步 QQ 空间说说依赖 **[ffmpeg](https://www.ffmpeg.org/)** 对视频文件进行切片，请确保系统运行内存足够，避免异常跳出。

添加需要同步的 QQ 空间，例如：

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

> 访问接口 `/qzone-login` 要求您以管理员身份登录站点。

为了获取请求 QQ 空间说说接口所需的登录态信息，您需要访问服务端的 `/qzone-login?qqNumber=${qqNumber}` 路由，扫码并登录到 QQ 空间。确认登录后，重启服务端或是等待下一次事务即可同步说说。

### 其它配置项

```ts
export const serverConfig: ServerConfig = {
  /** 服务端监听端口 */
  listeningPort: 4000,
  /** 同步 Timeline 信息的 Cron 规则；这里表示每小时的 0 和 30 分钟执行一次同步操作 */
  syncInterval: '*/30 * * * *',
}
```

## 项目开发

### 客户端开发

客户端默认监听 `localhost:3000`。

```bash
bun run dev:client
```

### 服务端开发

```bash
bun run dev:server
```

## 项目部署

### 客户端部署

编辑客户端配置后，需要手动构建新的静态资源。

```bash
bun run build:client
```

构建后的静态资源存放在 `client/out` 目录。

### 客户端部署

```bash
bun run start:server
```
