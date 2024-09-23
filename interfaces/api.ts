import type { SyncServiceType } from "../enums";
import type TimelineItem from "../server/src/database/entity/timeline-item";
import type { SyncServiceBase } from "./server";

export type GetTimelineItemsParams = {
  page?: string;
  limit?: string;
  serviceId?: string;
  serviceType?: SyncServiceType;
  search?: string;
};

export interface CountTimelineItemsParams {
  serviceId?: string;
  serviceType?: SyncServiceType;
  search?: string;
}

export type TimelineItemClient = Pick<
  TimelineItem,
  | "id"
  | "sync_service_type"
  | "title"
  | "content"
  | "url"
  | "attachments"
  | "version"
  | "created_at"
  | "updated_at"
> &
  Pick<SyncServiceBase, "label">;
