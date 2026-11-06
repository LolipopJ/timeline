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
    //   githubPersonalAccessToken: "ghp_yourGithubPersonalAccessToken",
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
    // {
    //   type: SyncServiceType.PSN_GAME_ACHIEVEMENT,
    //   id: "MyPsnAchievements",
    //   psnNpsso: "your_psn_npsso",
    //   // accountId: "your_numeric_psn_account_id", // 默认同步授权账号
    // },
    // {
    //   type: SyncServiceType.XBOX_GAME_ACHIEVEMENT,
    //   id: "MyXboxAchievements",
    //   xboxClientId: "your_oauth_application_id",
    //   xboxClientSecret: "your_oauth_application_secret",
    //   xboxTokenStorePath: "/absolute/path/to/timeline/server/.temporary/xbox.oauth.json",
    //   // xuid: "your_numeric_xbox_user_id", // 默认同步授权账号
    // },
    // {
    //   type: SyncServiceType.STEAM_GAME_ACHIEVEMENT,
    //   id: "MySteamAchievements",
    //   steamWebAPIKey: "your_steam_web_api_key",
    //   steamId: "your_steam_id64",
    //   // gameOverrides: {
    //   //   123456: {},
    //   //   234567: { baseAchievementIds: ["ACH_STORY", "ACH_FINAL"] },
    //   // },
    // },
    // {
    //   type: SyncServiceType.STEAM_RECENTLY_PLAYED_TIME,
    //   id: "MySteamRecentlyPlayedTime",
    //   steamWebAPIKey: "your_steam_web_api_key",
    //   steamId: "your_steam_id64",
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
};

export default serverConfig;
