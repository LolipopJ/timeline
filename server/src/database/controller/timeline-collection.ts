import type {
  BatchItemCollectionChange,
  CollectionLabelDto,
} from "@timeline/contracts";
import type { FindOptionsWhere } from "typeorm";
import type { EntityManager } from "typeorm";
import { Any } from "typeorm";

import {
  TimelineCollection,
  TimelineItemCollection,
} from "../entity/timeline-collection";
import TimelineItem from "../entity/timeline-item";
import dataSource from "../index";

export const getTimelineCollectionTree = async (
  where: FindOptionsWhere<TimelineItem> | FindOptionsWhere<TimelineItem>[],
  includeEmpty: boolean,
) => {
  const [visibleItems, parameters] = dataSource
    .getRepository(TimelineItem)
    .createQueryBuilder("item")
    .setFindOptions({ where })
    .select("item.id", "id")
    .getQueryAndParameters();

  // UNION counts each item once per ancestor across all of its memberships.
  const [tree] = await dataSource.query<
    {
      totalCount: number;
      nodes: (TimelineCollection & { item_count: number })[];
    }[]
  >(
    `WITH RECURSIVE visible_items AS (${visibleItems}),
     collection_items AS (
       SELECT membership.collection_id, membership.timeline_item_id
       FROM timeline_item_collection membership
       JOIN visible_items item ON item.id = membership.timeline_item_id
       UNION
       SELECT child.parent_id, membership.timeline_item_id
       FROM collection_items membership
       JOIN timeline_collection child ON child.id = membership.collection_id
       WHERE child.parent_id IS NOT NULL
     ),
     collection_counts AS (
       SELECT collection.id, collection.name, collection.parent_id,
              COUNT(membership.timeline_item_id) AS item_count
       FROM timeline_collection collection
       ${includeEmpty ? "LEFT JOIN" : "JOIN"} collection_items membership
         ON membership.collection_id = collection.id
       GROUP BY collection.id
     )
     SELECT to_jsonb((SELECT COUNT(*) FROM visible_items)) AS "totalCount",
            COALESCE(
              jsonb_agg(collection_counts ORDER BY item_count DESC, name, id),
              '[]'::jsonb
            ) AS nodes
     FROM collection_counts`,
    parameters,
  );
  return tree;
};

export const createTimelineCollection = async (
  name: string,
  parentId: string | null,
) => {
  const collections = dataSource.getRepository(TimelineCollection);
  if (parentId !== null && !(await collections.existsBy({ id: parentId })))
    return null;
  return collections.save({ name, parent_id: parentId });
};

export const getItemCollectionIds = async (id: string) => {
  const rows = await dataSource
    .getRepository(TimelineItem)
    .createQueryBuilder("item")
    .leftJoin(
      TimelineItemCollection,
      "membership",
      "membership.timeline_item_id = item.id",
    )
    .select("membership.collection_id", "id")
    .where({ id, achievement_merged: false })
    .orderBy("membership.collection_id", "ASC")
    .getRawMany<{ id: string | null }>();
  if (!rows.length) return null;
  return rows.flatMap(({ id }) => (id === null ? [] : [id]));
};

async function validateCollectionIds(
  manager: EntityManager,
  collectionIds: string[],
) {
  const ids = [...new Set(collectionIds.map((id) => id.toLowerCase()))];
  if (
    ids.length &&
    (await manager
      .getRepository(TimelineCollection)
      .countBy({ id: Any(ids) })) !== ids.length
  )
    return null;
  return ids;
}

export const saveItemCollectionIds = (id: string, collectionIds: string[]) =>
  dataSource.transaction(async (manager) => {
    const item = await manager.getRepository(TimelineItem).findOne({
      where: { id, achievement_merged: false },
      select: { id: true },
      lock: { mode: "pessimistic_write" },
    });
    if (!item) return "missing-item";

    const ids = await validateCollectionIds(manager, collectionIds);
    if (ids === null) return "invalid-collection";

    const memberships = manager.getRepository(TimelineItemCollection);
    await memberships.delete({ timeline_item_id: id });
    if (ids.length) {
      await memberships.insert(
        ids.map((collection_id) => ({ timeline_item_id: id, collection_id })),
      );
    }
    return "saved";
  });

export async function applyItemCollectionChanges(
  manager: EntityManager,
  itemIds: string[],
  { action, collectionIds }: BatchItemCollectionChange,
) {
  const ids = await validateCollectionIds(manager, collectionIds);
  if (ids === null) return "invalid-collection";

  if (action === "add-collections") {
    await manager.query(
      `INSERT INTO timeline_item_collection (timeline_item_id, collection_id)
       SELECT item.id, collection.id
       FROM unnest($1::uuid[]) AS item(id)
       CROSS JOIN unnest($2::uuid[]) AS collection(id)
       ON CONFLICT DO NOTHING`,
      [itemIds, ids],
    );
  } else {
    await manager.query(
      `WITH RECURSIVE collection_scope AS (
         SELECT id FROM timeline_collection WHERE id = ANY($2::uuid[])
         UNION
         SELECT child.id
         FROM timeline_collection child
         JOIN collection_scope parent ON child.parent_id = parent.id
       )
       DELETE FROM timeline_item_collection
       WHERE timeline_item_id = ANY($1::uuid[])
         AND collection_id IN (SELECT id FROM collection_scope)`,
      [itemIds, ids],
    );
  }
  return "saved";
}

export const getTimelineCollectionLabels = async (itemIds: string[]) => {
  const labelsByItem = new Map<string, CollectionLabelDto[]>();
  if (!itemIds.length) return labelsByItem;

  const labels = await dataSource.query<
    (CollectionLabelDto & { timeline_item_id: string })[]
  >(
    `WITH RECURSIVE ancestors AS (
       SELECT membership.timeline_item_id, collection.parent_id AS collection_id
       FROM timeline_item_collection membership
       JOIN timeline_collection collection ON collection.id = membership.collection_id
       WHERE membership.timeline_item_id = ANY($1::uuid[]) AND collection.parent_id IS NOT NULL
       UNION
       SELECT ancestors.timeline_item_id, collection.parent_id
       FROM ancestors
       JOIN timeline_collection collection ON collection.id = ancestors.collection_id
       WHERE collection.parent_id IS NOT NULL
     )
     SELECT membership.timeline_item_id, collection.id, collection.name
     FROM timeline_item_collection membership
     JOIN timeline_collection collection ON collection.id = membership.collection_id
     WHERE membership.timeline_item_id = ANY($1::uuid[])
       AND NOT EXISTS (
         SELECT 1 FROM ancestors
         WHERE ancestors.timeline_item_id = membership.timeline_item_id
           AND ancestors.collection_id = membership.collection_id
       )
     ORDER BY collection.name, collection.id`,
    [itemIds],
  );
  for (const { timeline_item_id, id, name } of labels) {
    const itemLabels = labelsByItem.get(timeline_item_id);
    if (itemLabels) itemLabels.push({ id, name });
    else labelsByItem.set(timeline_item_id, [{ id, name }]);
  }
  return labelsByItem;
};

export const moveTimelineCollection = (id: string, parentId: string | null) =>
  dataSource.transaction("READ COMMITTED", async (manager) => {
    // Concurrent moves must validate against the tree left by the preceding move.
    await manager.query(
      "LOCK TABLE timeline_collection IN SHARE ROW EXCLUSIVE MODE",
    );
    const collections = manager.getRepository(TimelineCollection);
    if (!(await collections.existsBy({ id }))) return "missing-collection";

    if (parentId !== null) {
      if (!(await collections.existsBy({ id: parentId })))
        return "missing-parent";
      const cycle = await manager.query<{ id: string }[]>(
        `WITH RECURSIVE ancestors AS (
           SELECT id, parent_id FROM timeline_collection WHERE id = $1
           UNION ALL
           SELECT parent.id, parent.parent_id
           FROM timeline_collection parent
           JOIN ancestors ON ancestors.parent_id = parent.id
         )
         SELECT id FROM ancestors WHERE id = $2`,
        [parentId, id],
      );
      if (cycle.length) return "cycle";
    }

    await collections.update(id, { parent_id: parentId });
    return "moved";
  });
