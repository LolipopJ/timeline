import { SyncServiceType } from "../enum";
import type { ServerConfig } from "../interface";

export const serverConfig: ServerConfig = {
  services: [
    // {
    //   type: SyncServiceType.GITHUB_ISSUE_COMMENT,
    //   id: "GithubIssueComments",
    //   label: "My Github Issue Comments",
    //   owner: "github_repo_owner",
    //   repo: "github_repo_name",
    //   issueNumber: 1,
    // },
  ],
  database: {
    user: "your_postgresql_user",
    password: "your_postgresql_password",
    host: "127.0.0.1",
    port: 5432,
    database: "timeline",
  },
  listeningPort: 4000,
  syncInterval: "*/30 * * * *",
  // githubPersonalAccessToken: "ghp_yourGithubPersonalAccessToken",
};

export default serverConfig;
