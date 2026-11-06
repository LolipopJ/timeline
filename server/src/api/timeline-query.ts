import type {
  CountTimelineItemsParams,
  TimelineView,
} from "@timeline/contracts";
import type { FindOptionsWhere } from "typeorm";
import { ILike } from "typeorm";

import type TimelineItem from "../database/entity/timeline-item";

export const isTimelineView = (
  view: unknown,
): view is TimelineView | undefined =>
  view === undefined || view === "public" || view === "admin";

export const isTimelineItemId = (id: unknown): id is string | undefined =>
  id === undefined ||
  (typeof id === "string" &&
    /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id));

export const getTimelineWhere = (
  { id, serviceId, serviceType, search, view }: CountTimelineItemsParams,
  isAdmin: boolean,
): FindOptionsWhere<TimelineItem> | FindOptionsWhere<TimelineItem>[] => {
  const base = {
    achievement_merged: false,
    ...(id === undefined ? {} : { id }),
    ...(serviceId === undefined ? {} : { sync_service_id: serviceId }),
    ...(serviceType === undefined ? {} : { sync_service_type: serviceType }),
    ...(isAdmin && view !== "public" ? {} : { is_secret: false }),
  };
  return search
    ? [
        { ...base, title: ILike(`%${search}%`) },
        { ...base, content: ILike(`%${search}%`) },
      ]
    : base;
};
