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

export const getTimelineWhere = (
  { serviceId, serviceType, search, view }: CountTimelineItemsParams,
  isAdmin: boolean,
): FindOptionsWhere<TimelineItem> | FindOptionsWhere<TimelineItem>[] => {
  const base = {
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
