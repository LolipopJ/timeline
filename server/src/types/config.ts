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
  | SyncServiceSteamGameReview
  | SyncServicePsnGameAchievement
  | SyncServiceXboxGameAchievement
  | SyncServiceSteamGameAchievement;

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

export interface SyncServicePsnGameAchievement extends SyncServiceBase {
  type: SyncServiceType.PSN_GAME_ACHIEVEMENT;
  /** @link https://psn-api.achievements.app/authentication/authenticating-manually */
  psnNpsso: string;
  /** PSN 数字账号 ID，省略时使用 NPSSO 对应的账号 */
  accountId?: string;
}

export interface SyncServiceXboxGameAchievement extends SyncServiceBase {
  type: SyncServiceType.XBOX_GAME_ACHIEVEMENT;
  /** 自有 OAuth Web 应用的 ID 和 secret，须与会话文件匹配 */
  xboxClientId: string;
  xboxClientSecret: string;
  /** xbox-webapi OAuth2TokenResponse JSON 会话文件的绝对路径 */
  xboxTokenStorePath: string;
  /** Xbox 数字用户 ID，省略时使用 OAuth 会话对应的账号 */
  xuid?: string;
}

export interface SyncServiceSteamGameAchievement extends SyncServiceBase {
  type: SyncServiceType.STEAM_GAME_ACHIEVEMENT;
  steamWebAPIKey: string;
  /** SteamID64，不是社区自定义地址 */
  steamId: string;
  /** 按 AppID 补充同步游戏，或为尚未分组的游戏指定已核验的本体成就 API ID */
  gameOverrides?: Record<number, { baseAchievementIds?: string[] }>;
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
  /** 可访问目标仓库的个人令牌，同步该令牌所属账号的评论 */
  githubPersonalAccessToken: string;
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
  steamWebAPIKey: string;
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
