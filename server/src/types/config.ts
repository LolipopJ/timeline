import type { SyncServiceType } from "@timeline/contracts";

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
   * 未单独配置 `syncInterval` 的同步服务使用的默认 Cron 表达式
   * @default *\/30 * * * *
   */
  syncInterval?: string;
  /**
   * 访问 Github 的个人令牌。同步包含 Github 相关的服务时需要提供
   * @link https://github.com/settings/tokens/new?scopes=repo
   */
  githubPersonalAccessToken?: string;
  /**
   * 预留：PSN 奖杯同步首次授权的 NPSSO，仅保留在服务端配置中。
   * 当前尚未接入授权或同步，填写不会触发请求。
   * @link https://psn-api.achievements.app/authentication/authenticating-manually
   */
  psnNpsso?: string;
  /**
   * 预留：Xbox 可刷新 TokenStore 文件的绝对路径，由 xal-node 登录生成。
   * 当前尚未读取会话文件或启用同步。
   * @link https://unknownskl.github.io/xal-node/docs/cli
   */
  xboxTokenStorePath?: string;
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
  /** Date before persistence, ISO string when read from the JSON column. */
  created_at?: Date | string;
  updated_at?: Date | string;
}

export type SyncService =
  | SyncServiceBilibiliCollection
  | SyncServiceBilibiliWork
  | SyncServiceFeed
  | SyncServiceGithubIssueComment
  | SyncServiceQzoneTalk
  | SyncServiceSteamRecentlyPlayedTime
  | SyncServiceSteamGameReview;

export interface SyncServiceBase {
  id: string;
  type: SyncServiceType;
  /** 是否启动定时同步功能 */
  enabled?: boolean;
  /** 此服务的定时同步 Cron 表达式，省略时使用全局设置 */
  syncInterval?: string;
  /** 前端展示的标签 */
  label?: string;
  /** 同步内容的最早日期 */
  from?: Date;
  /** 是否仅管理员用户可见 */
  secret?: boolean;
  /** 是否执行全量同步，忽略上次同步时间，仅受 `from` 字段约束 */
  full?: boolean;
}

export interface SyncServiceBilibiliCollection extends SyncServiceBase {
  type: SyncServiceType.BILIBILI_COLLECTION;
  /** Bilibili 收藏夹 ID */
  mediaId: string;
}

export interface SyncServiceBilibiliWork extends SyncServiceBase {
  type: SyncServiceType.BILIBILI_WORK;
  /** Bilibili 用户 ID */
  userId: string;
}

export interface SyncServiceFeed extends SyncServiceBase {
  type: SyncServiceType.FEED;
  /**
   * Supported syntaxes:
   * @enum `atom` - http://www.w3.org/2005/Atom
   * @enum `rss` - https://web.resource.org/rss/1.0/modules/content/
   */
  syntax?: "atom" | "rss";
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

export interface SyncServiceSteamGameReview extends SyncServiceBase {
  type: SyncServiceType.STEAM_GAME_REVIEW;
  /** Steam 用户 ID */
  userId: string;
}

export interface SyncServiceTelegramChat extends SyncServiceBase {
  type: SyncServiceType.TELEGRAM_CHAT;
  /** Telegram 聊天 ID */
  chatId: string;
}
