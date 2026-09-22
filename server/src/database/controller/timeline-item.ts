import type { FindManyOptions, FindOptionsWhere } from "typeorm";

import type { SyncService } from "../../../../interfaces/server";
import TimelineItem from "../entity/timeline-item";
import dataSource from "../index";

export const getSyncTaskLastExecuteTime = async (
  syncService: Pick<SyncService, "id" | "from" | "full">,
) => {
  const { id, from, full } = syncService;

  if (full) {
    // 全量同步：忽略数据库中已同步的时间，仅保留 `from` 字段的下限约束
    return new Date(from ?? 0);
  }

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

export const updateTimelineItem = async (
  id: string,
  updateData: Partial<TimelineItem>,
) => {
  return await dataSource
    .getRepository(TimelineItem)
    .update({ id }, updateData);
};

export const getTimelineItems = async (
  options: FindManyOptions<TimelineItem>,
) => {
  return await dataSource.getRepository(TimelineItem).find({
    cache: true,
    ...options,
  });
};

export const getTimelineItemsBy = async (
  options: FindOptionsWhere<TimelineItem>,
) => {
  return await dataSource.getRepository(TimelineItem).findBy(options);
};

export const countTimelineItems = async (
  options?: FindManyOptions<TimelineItem>,
) => {
  return await dataSource.getRepository(TimelineItem).count(options);
};

export const softDeleteTimelineItem = async (id: string) => {
  return await dataSource.getRepository(TimelineItem).softDelete({ id });
};

export const restoreSoftDeletedTimelineItem = async (id: string) => {
  return await dataSource.getRepository(TimelineItem).restore({ id });
};
