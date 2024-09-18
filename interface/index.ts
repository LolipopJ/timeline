import type { SyncServiceType } from "../enum/index";

export interface ClientConfig {
  metadata: import("next").Metadata;
}

export interface ServerConfig {
  services: SyncService[];
  database: {
    user: string;
    password: string;
    host: string;
    port: number;
    database: string;
  };
  listeningPort?: number;
  syncInterval?: string;
  /** https://github.com/settings/tokens/new?scopes=repo */
  githubPersonalAccessToken?: string;
  /** https://steamcommunity.com/dev/apikey */
  steamWebAPIKey?: string;
}

export interface TimelineItemAttachment {
  filename: string;
  url: string;
  created_at?: Date;
  updated_at?: Date;
}

export type SyncService =
  | SyncServiceBilibiliCollection
  | SyncServiceGithubIssueComment
  | SyncServiceFeed
  | SyncServiceSteamRecentlyPlayedTime;

interface SyncServiceBase {
  id: string;
  type: SyncServiceType;
  label?: string;
  from?: Date;
}

export interface SyncServiceBilibiliCollection extends SyncServiceBase {
  type: SyncServiceType.BILIBILI_COLLECTION;
  /** 收藏夹 ID */
  mediaId: string;
}

export interface SyncServiceGithubIssueComment extends SyncServiceBase {
  type: SyncServiceType.GITHUB_ISSUE_COMMENT;
  owner: string;
  repo: string;
  issueNumber: number;
}

export interface SyncServiceFeed extends SyncServiceBase {
  type: SyncServiceType.FEED;
  /**
   * Supported syntaxes:
   * `atom`: http://www.w3.org/2005/Atom
   */
  syntax?: "atom";
  url: string;
}

export interface SyncServiceSteamRecentlyPlayedTime extends SyncServiceBase {
  type: SyncServiceType.STEAM_RECENTLY_PLAYED_TIME;
  /** https://help.steampowered.com/zh-cn/faqs/view/2816-BE67-5B69-0FEC */
  steamId: string;
}
