import type { SyncServiceType } from "./enums";

export type GetTimelineItemsParams = {
  page?: string;
  limit?: string;
  orderBy?: "created_at" | "updated_at";
  serviceId?: string;
  serviceType?: SyncServiceType;
  search?: string;
};

export interface CountTimelineItemsParams {
  serviceId?: string;
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
  version?: number;
  created_at: string;
  updated_at: string;
  is_secret?: boolean | null;
}
