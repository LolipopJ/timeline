import type { BatchTimelineItemsParams } from "@timeline/contracts";
import type { FindManyOptions, FindOptionsWhere } from "typeorm";
import { Any, Raw } from "typeorm";

import type { SyncService } from "../../types/config";
import TimelineItem from "../entity/timeline-item";
import dataSource from "../index";
import { applyItemCollectionChanges } from "./timeline-collection";

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
  await dataSource.getRepository(TimelineItem).upsert(timelineItems, {
    conflictPaths: {
      content_id: true,
      sync_service_id: true,
    },
  });
  return timelineItems.length;
};

// One-time events keep their original row, including administrator edits and soft deletion.
export const insertNewTimelineItems = async (
  timelineItems: TimelineItem[],
): Promise<number> => {
  if (timelineItems.length === 0) return 0;

  const result = await dataSource
    .getRepository(TimelineItem)
    .createQueryBuilder()
    .insert()
    .values(timelineItems)
    .orIgnore()
    .returning(["id"])
    .updateEntity(false)
    .execute();

  return result.raw.length;
};

export const updateTimelineItem = async (
  id: string,
  updateData: Partial<TimelineItem>,
) => {
  return await dataSource
    .getRepository(TimelineItem)
    .update({ id }, updateData);
};

const getTimelineQuery = (
  options: FindManyOptions<TimelineItem>,
  collectionId?: string,
) => {
  const query = dataSource
    .getRepository(TimelineItem)
    .createQueryBuilder("item")
    .setFindOptions(options);
  if (collectionId !== undefined) {
    query
      .addCommonTableExpression(
        `SELECT id FROM timeline_collection WHERE id = :collectionId
         UNION ALL
         SELECT child.id
         FROM timeline_collection child
         JOIN collection_scope parent ON child.parent_id = parent.id`,
        "collection_scope",
        { recursive: true },
      )
      .andWhere(
        `EXISTS (
           SELECT 1 FROM timeline_item_collection membership
           JOIN collection_scope scope ON scope.id = membership.collection_id
           WHERE membership.timeline_item_id = item.id
         )`,
        { collectionId },
      );
  }
  return query;
};

export const getTimelineItems = (
  options: FindManyOptions<TimelineItem>,
  collectionId?: string,
) => getTimelineQuery({ cache: true, ...options }, collectionId).getMany();

export const getTimelineItemsBy = async (
  options: FindOptionsWhere<TimelineItem>,
) => {
  return await dataSource.getRepository(TimelineItem).findBy(options);
};

export const countTimelineItems = (
  options: FindManyOptions<TimelineItem>,
  collectionId?: string,
) => getTimelineQuery(options, collectionId).getCount();

export const getTimelineServiceIds = async (
  options: FindManyOptions<TimelineItem>,
) => {
  const sources = await dataSource
    .getRepository(TimelineItem)
    .createQueryBuilder("item")
    .select("item.sync_service_id", "id")
    .distinct(true)
    .setFindOptions(options)
    .getRawMany<{ id: string }>();
  return sources.map(({ id }) => id);
};

export const softDeleteTimelineItem = async (id: string) => {
  return await dataSource.getRepository(TimelineItem).softDelete({ id });
};

export const applyTimelineItemBatch = (input: BatchTimelineItemsParams) =>
  dataSource.transaction(async (manager) => {
    const itemIds = [...new Set(input.itemIds.map((id) => id.toLowerCase()))];
    const items = manager.getRepository(TimelineItem);
    const where = { id: Any(itemIds), achievement_merged: false };
    // Lock overlapping selections in the same order before applying any changes.
    const editableItems = await items.find({
      where,
      select: { id: true },
      order: { id: "ASC" },
      lock: { mode: "pessimistic_write" },
    });
    if (editableItems.length !== itemIds.length) return "missing-item";

    if (input.action === "delete") {
      await items.softDelete(where);
    } else if (input.action === "make-private") {
      await items.update(
        {
          ...where,
          is_secret: Raw((column) => `${column} IS DISTINCT FROM TRUE`),
        },
        { is_secret: true },
      );
    } else {
      return applyItemCollectionChanges(manager, itemIds, input);
    }
    return "saved";
  });

export const restoreSoftDeletedTimelineItem = async (id: string) => {
  return await dataSource.getRepository(TimelineItem).restore({ id });
};
