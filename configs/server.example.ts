import { SyncServiceType } from "../enums";
import type { ServerConfig } from "../interfaces/server";

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
  syncInterval: "*/30 * * * *",
  // githubPersonalAccessToken: "ghp_yourGithubPersonalAccessToken",
};

export default serverConfig;
