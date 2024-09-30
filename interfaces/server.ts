import type { SyncServiceType } from "../enums/index";

export interface ServerConfig {
  services: SyncService[];
  database: {
    user: string;
    password: string;
    host: string;
    port: number;
    database: string;
  };
  admin?: {
    secretKey: string;
    accounts: LoginAccount[];
  };
  listeningPort?: number;
  /**
   * Access-Control-Allow-Origin
   * @link https://elysiajs.com/plugins/cors.html#origin
   * @default true
   */
  allowedOrigin?: string | RegExp | true;
  /**
   * 执行同步任务的时间计划。Cron 格式
   * @default *\/30 * * * *
   */
  syncInterval?: string;
  /**
   * 访问 Github 的个人令牌。同步包含 Github 相关的服务时需要提供
   * @link https://github.com/settings/tokens/new?scopes=repo
   */
  githubPersonalAccessToken?: string;
  /**
   * 访问 Steam API 的令牌。同步包含 Steam 相关的服务时需要提供
   * @link https://steamcommunity.com/dev/apikey
   */
  steamWebAPIKey?: string;
}

export interface LoginAccount {
  username: string;
  password: string;
}

export interface TimelineItemAttachment {
  /** 文件名 */
  filename: string;
  /** 文件链接 */
  url: string;
  /** 文件封面链接 */
  coverUrl?: string;
  created_at?: Date;
  updated_at?: Date;
}

export type SyncService =
  | SyncServiceBilibiliCollection
  | SyncServiceFeed
  | SyncServiceGithubIssueComment
  | SyncServiceQzoneTalk
  | SyncServiceSteamRecentlyPlayedTime;

export interface SyncServiceBase {
  id: string;
  type: SyncServiceType;
  /** 前端展示的标签 */
  label?: string;
  /** 同步内容的最早日期 */
  from?: Date;
  /** 仅管理员用户可见 */
  secret?: boolean;
}

export interface SyncServiceBilibiliCollection extends SyncServiceBase {
  type: SyncServiceType.BILIBILI_COLLECTION;
  /** Bilibili 收藏夹 ID */
  mediaId: string;
}

export interface SyncServiceFeed extends SyncServiceBase {
  type: SyncServiceType.FEED;
  /**
   * Supported syntaxes:
   * @enum `atom` - http://www.w3.org/2005/Atom
   */
  syntax?: "atom";
  url: string;
}

export interface SyncServiceGithubIssueComment extends SyncServiceBase {
  type: SyncServiceType.GITHUB_ISSUE_COMMENT;
  owner: string;
  repo: string;
  issueNumber: number;
}

export interface SyncServiceQzoneTalk extends SyncServiceBase {
  type: SyncServiceType.QZONE_TALK;
  qqNumber: string;
}

export interface SyncServiceSteamRecentlyPlayedTime extends SyncServiceBase {
  type: SyncServiceType.STEAM_RECENTLY_PLAYED_TIME;
  /** https://help.steampowered.com/zh-cn/faqs/view/2816-BE67-5B69-0FEC */
  steamId: string;
}

export interface SyncServiceTelegramChat extends SyncServiceBase {
  type: SyncServiceType.TELEGRAM_CHAT;
  chatId: string;
}
