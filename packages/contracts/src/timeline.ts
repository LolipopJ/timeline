import type {
  BatchItemCollectionChange,
  CollectionLabelDto,
} from "./collections";
import type { SyncServiceType } from "./enums";

export type TimelineView = "public" | "admin";

export const TIMELINE_VIEW_HEADER = "x-timeline-view";

export type GetTimelineItemsParams = CountTimelineItemsParams & {
  page?: string;
  limit?: string;
  orderBy?: "created_at" | "updated_at";
};

export interface CountTimelineItemsParams {
  id?: string;
  collectionId?: string;
  view?: TimelineView;
  serviceLabel?: string;
  serviceType?: SyncServiceType;
  search?: string;
}

export interface UpdateTimelineItemParams {
  is_secret?: boolean | null;
}

export type BatchTimelineItemsParams = { itemIds: string[] } & (
  { action: "make-private" } | { action: "delete" } | BatchItemCollectionChange
);

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
  collectionLabels: CollectionLabelDto[];
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
