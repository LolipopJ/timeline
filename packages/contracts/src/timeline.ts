import type { SyncServiceType } from "./enums";

export type TimelineView = "public" | "admin";

export type GetTimelineItemsParams = {
  id?: string;
  view?: TimelineView;
  page?: string;
  limit?: string;
  orderBy?: "created_at" | "updated_at";
  serviceLabel?: string;
  serviceType?: SyncServiceType;
  search?: string;
};

export interface CountTimelineItemsParams {
  id?: string;
  view?: TimelineView;
  serviceLabel?: string;
  serviceType?: SyncServiceType;
  search?: string;
}

export interface UpdateTimelineItemParams {
  is_secret?: boolean | null;
}

export interface TimelineItemAttachmentDto {
  filename: string;
  url: string;
  coverUrl?: string;
  created_at?: string;
  updated_at?: string;
}

export interface TimelineItemClient {
  id: string;
  sync_service_id: string;
  sync_service_type: SyncServiceType;
  content_id: string;
  label?: string;
  title?: string | null;
  content?: string | null;
  url?: string | null;
  attachments?: TimelineItemAttachmentDto[] | null;
  achievement?: GameAchievementDto | null;
  version?: number;
  created_at: string;
  updated_at: string;
  is_secret?: boolean | null;
}

export interface GameAchievementDto {
  platform: "psn" | "xbox" | "steam";
  gameId: string;
  kind: "platinum" | "mythic" | "base_completion" | "all_achievements";
  earnedCount?: number;
  totalCount?: number;
}
