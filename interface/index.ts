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
  githubPersonalAccessToken?: string;
}

export type SyncService = SyncServiceGithubIssueComment | SyncServiceRSS;

interface SyncServiceBase {
  id: string;
  type: SyncServiceType;
  label?: string;
  from?: string;
  to?: string;
}

export interface SyncServiceGithubIssueComment extends SyncServiceBase {
  type: SyncServiceType.GITHUB_ISSUE_COMMENT;
  owner: string;
  repo: string;
  issueNumber: number;
}

export interface SyncServiceRSS extends SyncServiceBase {
  type: SyncServiceType.RSS;
  url: string;
}

export interface TimelineItemAttachment {
  filename: string;
  url: string;
  createdAt?: string;
  updatedAt?: string;
}
