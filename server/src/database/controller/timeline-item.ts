import type { FindManyOptions } from "typeorm";

import type { SyncService } from "../../../../interface";
import TimelineItem from "../entity/timeline-item";
import dataSource from "../index";

export const getSyncTaskLastExecuteTime = async (
  syncService: Pick<SyncService, "id" | "from">,
) => {
  const { id, from } = syncService;
  const lastUpdatedTimelineItem = await dataSource
    .getRepository(TimelineItem)
    .findOne({
      where: { sync_service_id: id },
      order: { updated_at: "DESC" },
      select: {
        updated_at: true,
      },
    });
  return new Date(lastUpdatedTimelineItem?.updated_at ?? from ?? 0);
};

export const insertOrUpdateTimelineItems = async (
  timelineItems: TimelineItem[],
) => {
  return await dataSource.getRepository(TimelineItem).upsert(timelineItems, {
    conflictPaths: {
      content_id: true,
      sync_service_id: true,
    },
  });
};

export const getTimelineItems = async (
  options: FindManyOptions<TimelineItem>,
) => {
  return await dataSource.getRepository(TimelineItem).find({
    cache: true,
    ...options,
    order: {
      created_at: "DESC",
      ...options.order,
    },
  });
};
