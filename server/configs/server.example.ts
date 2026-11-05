import type { ServerConfig } from "../src/types/config";

export const serverConfig: ServerConfig = {
  services: [
    // {
    //   type: SyncServiceType.BILIBILI_COLLECTION,
    //   id: "MyBilibiliCollections",
    //   label: "My Bilibili Collections",
    //   mediaId: "75618059",
    // },
    // {
    //   type: SyncServiceType.BILIBILI_WORK,
    //   id: "MyBilibiliWorks",
    //   label: "My Bilibili Works",
    //   userId: "15487659",
    // },
    // {
    //   type: SyncServiceType.FEED,
    //   id: "MyBlog",
    //   label: "My Blog Articles",
    //   syntax: "atom",
    //   url: "https://blog.example.com/atom.xml",
    //   syncInterval: "0 * * * *", // 可选，此来源每小时同步一次
    // },
    // {
    //   type: SyncServiceType.GITHUB_ISSUE_COMMENT,
    //   id: "GithubIssueComments",
    //   label: "My Github Issue Comments",
    //   owner: "github_repo_owner",
    //   repo: "github_repo_name",
    //   issueNumber: 1,
    // },
    // {
    //   type: SyncServiceType.QZONE_TALK,
    //   id: "MyQQZone",
    //   label: "My QQ Zone",
    //   qqNumber: "408550000",
    //   from: new Date("2018-01-01"),
    // },
  ],
  database: {
    user: "your_postgresql_user",
    password: "your_postgresql_password",
    host: "127.0.0.1",
    port: 5432,
    database: "timeline",
  },
  admin: {
    secretKey: "change_this_field_to_your_secret_key",
    accounts: [
      {
        username: "admin_username",
        password: "admin_password",
      },
    ],
  },
  listeningPort: 4000,
  syncInterval: "*/30 * * * *", // 未单独配置的来源每 30 分钟同步一次
  // githubPersonalAccessToken: "ghp_yourGithubPersonalAccessToken",
  // PSN、Xbox 仅预留凭据，填写后尚不会启用奖杯同步。
  // psnNpsso: "your_psn_npsso",
  // xboxTokenStorePath: "C:/path/to/timeline/server/.temporary/xbox.tokens.json",
  // steamWebAPIKey: "your_steam_web_api_key",
};

export default serverConfig;
