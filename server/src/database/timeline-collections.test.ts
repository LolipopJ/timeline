import "reflect-metadata";

import { randomUUID } from "node:crypto";

import { SyncServiceType } from "@timeline/contracts";
import { expect, test } from "bun:test";
import { In } from "typeorm";
import { z } from "zod";

import config from "../config";
import { app } from "../index";
import { JWT } from "../utils/jwt";
import { TimelineCollection } from "./entity/timeline-collection";
import TimelineItem from "./entity/timeline-item";
import dataSource, { DATABASE_NAME } from "./index";

const databaseTest = process.env.NODE_ENV === "development" ? test : test.skip;
const labelSchema = z.object({ id: z.guid(), name: z.string() });
const nodeSchema = labelSchema.extend({ parentId: z.guid().nullable() });
const countSchema = z.number().int().nonnegative();
const treeSchema = z.object({
  totalCount: countSchema,
  uncategorizedCount: countSchema,
  nodes: z.array(nodeSchema.extend({ itemCount: countSchema })),
});
const membershipSchema = z.object({ collectionIds: z.array(z.guid()) });
const pageSchema = z.array(
  z.object({
    id: z.guid(),
    collectionLabels: z.array(labelSchema),
    updated_at: z.iso.datetime(),
  }),
);

databaseTest(
  "collections preserve privacy, direct membership, pagination and the tree across moves",
  async () => {
    expect(DATABASE_NAME.endsWith("_dev")).toBe(true);
    const admin = config.admin;
    if (!admin?.accounts.length)
      throw new Error("合集开发库回归需要启用管理员配置");
    const token = new JWT(admin.secretKey).sign({
      username: admin.accounts[0].username,
    });
    const request = (
      path: string,
      method = "GET",
      payload?: object,
      loggedIn = true,
    ) =>
      app.handle(
        new Request("http://localhost" + path, {
          method,
          headers: {
            ...(loggedIn ? { Cookie: "access-token=" + token } : {}),
            ...(payload ? { "content-type": "application/json" } : {}),
          },
          body: payload ? JSON.stringify(payload) : undefined,
        }),
      );

    await dataSource.initialize();
    const items = dataSource.getRepository(TimelineItem);
    const collections = dataSource.getRepository(TimelineCollection);
    const service = "collection-check-" + randomUUID();
    const otherService = service + "-other";
    const created: string[] = [];
    async function seedItem(
      title: string,
      minute: number,
      source = service,
      is_secret = false,
    ) {
      const date = new Date(Date.UTC(2026, 0, 1, 0, minute));
      const item = await items.save({
        sync_service_type: SyncServiceType.FEED,
        sync_service_id: source,
        content_id: String(minute),
        title,
        is_secret,
        created_at: date,
        updated_at: date,
      });
      if (!item.id) throw new Error("Missing ID of saved test item");
      return item.id;
    }
    async function create(name: string, parentId: string | null = null) {
      const response = await request("/timeline-collections", "POST", {
        name: service + " " + name,
        parentId,
      });
      expect(response.status).toBe(201);
      const node = nodeSchema.parse(await response.json());
      created.push(node.id);
      expect(node.parentId).toBe(parentId);
      return node.id;
    }
    const membership = (id: string) => "/timeline-items/" + id + "/collections";
    const save = (id: string, collectionIds: string[]) =>
      request(membership(id), "PATCH", { collectionIds });
    async function directIds(id: string) {
      const response = await request(membership(id));
      expect(response.status).toBe(200);
      return membershipSchema.parse(await response.json()).collectionIds;
    }
    const move = (id: string, parentId: string | null) =>
      request("/timeline-collections/" + id + "/parent", "PATCH", { parentId });
    const rename = (id: string, name: string) =>
      request("/timeline-collections/" + id + "/name", "PATCH", { name });
    const remove = (id: string) =>
      request("/timeline-collections/" + id, "DELETE");
    const query =
      "view=public&serviceLabel=" +
      service +
      "&search=matching&orderBy=updated_at";
    async function list(params: string, loggedIn = true) {
      const response = await request(
        "/timeline-items?" + params,
        "GET",
        undefined,
        loggedIn,
      );
      expect(response.status).toBe(200);
      return pageSchema.parse(await response.json());
    }
    async function count(params: string, loggedIn = true) {
      const response = await request(
        "/timeline-items/count?" + params,
        "GET",
        undefined,
        loggedIn,
      );
      expect(response.status).toBe(200);
      return countSchema.parse(await response.json());
    }

    async function collectionTree(view: string, loggedIn = true) {
      const response = await request(
        "/timeline-collections?view=" + view,
        "GET",
        undefined,
        loggedIn,
      );
      expect(response.status).toBe(200);
      return treeSchema.parse(await response.json());
    }

    try {
      const oldRoot = await create("旅行");
      const newRoot = await create("摄影");
      const branch = await create("日本", oldRoot);
      const kyoto = await create("Z 京都", branch);
      const osaka = await create("A 大阪", branch);
      const privateRoot = await create("仅管理员");
      const privateLeaf = await create("私密分支", privateRoot);
      const multi = await seedItem("matching descendant", 5);
      const parentOnly = await seedItem("matching parent", 2);
      const uncategorized = await seedItem("matching uncategorized", 1);
      const secret = await seedItem("matching secret", 4, service, true);
      const otherSourceItem = await seedItem(
        "matching other source",
        3,
        otherService,
      );
      const keywordMiss = await seedItem("exclude by keyword", 6);
      const merged = await seedItem("merged achievement", 7);

      expect((await list(query)).map(({ id }) => id)).toContain(uncategorized);
      expect(await count(query)).toBe(3);
      expect(
        (
          await request(
            "/timeline-collections",
            "POST",
            { name: service, parentId: null },
            false,
          )
        ).status,
      ).toBe(401);
      expect(
        (await request(membership(multi), "GET", undefined, false)).status,
      ).toBe(401);
      expect(
        (await save(multi, [oldRoot, kyoto, osaka, kyoto.toUpperCase()]))
          .status,
      ).toBe(204);
      expect(new Set(await directIds(multi))).toEqual(
        new Set([oldRoot, kyoto, osaka]),
      );
      expect((await save(multi, [newRoot, randomUUID()])).status).toBe(400);
      expect(new Set(await directIds(multi))).toEqual(
        new Set([oldRoot, kyoto, osaka]),
      );
      expect((await save(uncategorized, [kyoto])).status).toBe(204);
      expect((await save(uncategorized, [])).status).toBe(204);
      expect(await directIds(uncategorized)).toEqual([]);
      expect((await save(parentOnly, [oldRoot])).status).toBe(204);
      expect((await save(secret, [privateLeaf, kyoto])).status).toBe(204);
      expect((await save(otherSourceItem, [kyoto])).status).toBe(204);
      expect((await save(keywordMiss, [oldRoot])).status).toBe(204);
      expect((await save(merged, [osaka])).status).toBe(204);
      await items.update(merged, { achievement_merged: true });

      for (const [view, loggedIn] of [
        ["public", true],
        ["admin", false],
        ["admin", true],
      ] as const) {
        const { totalCount, uncategorizedCount, nodes } = await collectionTree(
          view,
          loggedIn,
        );
        expect(totalCount).toBe(await count("view=" + view, loggedIn));
        expect(uncategorizedCount).toBe(
          await count("view=" + view + "&collectionId=uncategorized", loggedIn),
        );
        const ownNodes = nodes.filter(({ id }) => created.includes(id));
        const counts = new Map(
          ownNodes.map(({ id, itemCount }) => [id, itemCount]),
        );
        const fullTree = view === "admin" && loggedIn;
        expect(counts).toEqual(
          new Map([
            [oldRoot, fullTree ? 5 : 4],
            [branch, fullTree ? 3 : 2],
            [kyoto, fullTree ? 3 : 2],
            [osaka, 1],
            ...(fullTree
              ? ([
                  [privateRoot, 1],
                  [privateLeaf, 1],
                  [newRoot, 0],
                ] as const)
              : []),
          ]),
        );
        expect(
          ownNodes
            .filter(({ parentId }) => parentId === branch)
            .map(({ id }) => id),
        ).toEqual([kyoto, osaka]);
      }

      const travel = query + "&collectionId=" + oldRoot;
      expect(await count(travel)).toBe(2);
      const first = await list(travel + "&page=0&limit=1");
      const second = await list(travel + "&page=1&limit=1");
      expect(first.map(({ id }) => id)).toEqual([multi]);
      expect(new Set(first[0].collectionLabels.map(({ id }) => id))).toEqual(
        new Set([kyoto, osaka]),
      );
      expect(first[0].updated_at).toBe("2026-01-01T00:05:00.000Z");
      expect(second.map(({ id }) => id)).toEqual([parentOnly]);
      expect(second[0].collectionLabels).toEqual([
        { id: oldRoot, name: service + " 旅行" },
      ]);
      expect(await list(travel + "&page=2&limit=1")).toHaveLength(0);
      expect(await count(query + "&collectionId=" + kyoto)).toBe(1);
      expect(
        (await list(query + "&collectionId=uncategorized")).map(({ id }) => id),
      ).toEqual([uncategorized]);
      expect(await count(query + "&collectionId=uncategorized")).toBe(1);

      for (const id of [privateRoot, randomUUID()]) {
        const scoped = query + "&collectionId=" + id;
        expect(await list(scoped, false)).toEqual([]);
        expect(await count(scoped)).toBe(0);
      }
      const sharedItem =
        "view=public&id=" + uncategorized + "&collectionId=" + oldRoot;
      expect((await list(sharedItem)).map(({ id }) => id)).toEqual([
        uncategorized,
      ]);
      expect(await count(sharedItem)).toBe(1);

      expect((await request("/timeline-items/" + multi, "DELETE")).status).toBe(
        200,
      );
      expect((await request(membership(multi))).status).toBe(404);
      expect((await save(multi, [])).status).toBe(404);
      expect(await count(travel)).toBe(1);
      expect(
        (await collectionTree("admin")).nodes.find(({ id }) => id === osaka)
          ?.itemCount,
      ).toBe(0);
      expect(
        (await request("/timeline-items/" + multi + "/restore", "POST")).status,
      ).toBe(200);
      expect(new Set(await directIds(multi))).toEqual(
        new Set([oldRoot, kyoto, osaka]),
      );
      expect(await count(travel)).toBe(2);

      expect((await save(multi, [kyoto, osaka])).status).toBe(204);
      expect((await move(branch, kyoto)).status).toBe(400);
      expect((await move(branch, branch)).status).toBe(400);
      expect((await move(branch, randomUUID())).status).toBe(400);
      expect((await move(branch, newRoot)).status).toBe(204);
      const photo = query + "&collectionId=" + newRoot;
      expect((await list(travel)).map(({ id }) => id)).toEqual([parentOnly]);
      expect(await count(travel)).toBe(1);
      expect((await list(photo)).map(({ id }) => id)).toEqual([multi]);
      expect(await count(photo)).toBe(1);
      expect((await move(branch, null)).status).toBe(204);
      expect(await count(photo)).toBe(0);
      expect(
        (await list(query + "&collectionId=" + branch)).map(({ id }) => id),
      ).toEqual([multi]);

      const left = await create("并发甲");
      const right = await create("并发乙");
      const results = await Promise.all([move(left, right), move(right, left)]);
      expect(results.map(({ status }) => status).sort()).toEqual([204, 400]);
      expect(
        (await collections.findBy({ id: In([left, right]) })).filter(
          ({ parent_id }) => parent_id,
        ),
      ).toHaveLength(1);
      const batch = (payload: object) =>
        request("/timeline-items/batch", "POST", payload);
      const itemIds = [multi.toUpperCase(), parentOnly, multi];
      expect(
        (
          await batch({
            action: "add-collections",
            itemIds,
            collectionIds: [newRoot, randomUUID()],
          })
        ).status,
      ).toBe(400);
      expect(new Set(await directIds(multi))).toEqual(new Set([kyoto, osaka]));
      const add = {
        action: "add-collections",
        itemIds,
        collectionIds: [newRoot],
      };
      expect((await batch(add)).status).toBe(204);
      expect((await batch(add)).status).toBe(204);
      expect(new Set(await directIds(multi))).toEqual(
        new Set([kyoto, osaka, newRoot]),
      );
      expect(new Set(await directIds(parentOnly))).toEqual(
        new Set([oldRoot, newRoot]),
      );
      expect(
        (
          await batch({
            action: "remove-collections",
            itemIds,
            collectionIds: [branch],
          })
        ).status,
      ).toBe(204);
      expect(await directIds(multi)).toEqual([newRoot]);
      expect(new Set(await directIds(parentOnly))).toEqual(
        new Set([oldRoot, newRoot]),
      );
      expect(await directIds(uncategorized)).toEqual([]);

      expect(
        (
          await batch({
            action: "make-private",
            itemIds: [...itemIds, randomUUID()],
          })
        ).status,
      ).toBe(404);
      expect(await count(query)).toBe(3);
      expect((await batch({ action: "make-private", itemIds })).status).toBe(
        204,
      );
      expect((await list(query)).map(({ id }) => id)).toEqual([uncategorized]);
      expect(await count(query)).toBe(1);
      expect(
        (await list("view=admin&id=" + multi)).map(({ id }) => id),
      ).toEqual([multi]);

      expect((await batch({ action: "delete", itemIds })).status).toBe(204);
      expect(await list("view=admin&id=" + multi)).toEqual([]);
      expect(await list("view=admin&id=" + parentOnly)).toEqual([]);
      expect(
        (await request("/timeline-items/" + multi + "/restore", "POST")).status,
      ).toBe(200);
      expect(await directIds(multi)).toEqual([newRoot]);
      expect(await list("view=public&id=" + multi)).toEqual([]);

      // Renaming updates tree nodes, sibling ordering and card labels without altering memberships.
      const siblingA = await create("A 乙", newRoot);
      const siblingB = await create("B 甲", newRoot);
      expect(
        (await collectionTree("admin")).nodes
          .filter(({ parentId }) => parentId === newRoot)
          .map(({ id }) => id),
      ).toEqual([siblingA, siblingB]);
      expect((await rename(newRoot, "   ")).status).toBe(400);
      expect((await rename("invalid", "有效名称")).status).toBe(400);
      expect((await rename(randomUUID(), "有效名称")).status).toBe(404);
      expect((await rename(newRoot, "  " + service + " 影像  ")).status).toBe(
        204,
      );
      expect((await rename(siblingB, "0 甲")).status).toBe(204);
      expect(
        (await collectionTree("admin")).nodes
          .filter(({ parentId }) => parentId === newRoot)
          .map(({ id }) => id),
      ).toEqual([siblingB, siblingA]);
      expect(
        (await collectionTree("admin")).nodes.find(({ id }) => id === newRoot)
          ?.name,
      ).toBe(service + " 影像");
      expect(
        (await list("view=admin&id=" + multi))[0]?.collectionLabels,
      ).toEqual([{ id: newRoot, name: service + " 影像" }]);

      // Deleting a collection subtree cascades to descendant collections and memberships, never timeline items.
      expect((await remove("invalid")).status).toBe(400);
      expect((await remove(randomUUID())).status).toBe(404);
      expect((await move(branch, oldRoot)).status).toBe(204);
      expect(
        (await request("/timeline-items/" + parentOnly + "/restore", "POST"))
          .status,
      ).toBe(200);
      expect((await save(parentOnly, [oldRoot, kyoto, newRoot])).status).toBe(
        204,
      );
      expect(
        (await rename(parentOnly, "unused")).status, // sanity check: item UUID is not a collection
      ).toBe(404);
      expect((await remove(oldRoot)).status).toBe(204);
      expect((await remove(oldRoot)).status).toBe(404);
      expect(
        (await collectionTree("admin")).nodes.filter(({ id }) =>
          [oldRoot, branch, kyoto, osaka].includes(id),
        ),
      ).toEqual([]);
      expect(
        (
          await request("/timeline-collections", "POST", {
            name: service + " 幽灵子合集",
            parentId: branch,
          })
        ).status,
      ).toBe(400);
      expect(await list("view=admin&id=" + parentOnly)).toEqual([
        expect.objectContaining({
          id: parentOnly,
          collectionLabels: [{ id: newRoot, name: service + " 影像" }],
        }),
      ]);
      expect(await directIds(parentOnly)).toEqual([newRoot]);
      expect(await list("view=admin&id=" + multi)).toEqual([
        expect.objectContaining({ id: multi }),
      ]);
      expect(await list(travel)).toEqual([]);
      expect(await count(travel)).toBe(0);

      // Concurrent delete and child creation serialize without leaving orphans or 500s.
      const doomed = await create("并发删除");
      const [deleteResult, createChildResult] = await Promise.all([
        remove(doomed),
        request("/timeline-collections", "POST", {
          name: service + " 并发子合集",
          parentId: doomed,
        }),
      ]);
      expect(deleteResult.status).toBe(204);
      expect([201, 400]).toContain(createChildResult.status);
      if (createChildResult.status === 201) {
        const child = nodeSchema.parse(await createChildResult.json());
        created.push(child.id);
      }
      expect(
        (await collectionTree("admin")).nodes.filter(
          ({ id, parentId }) => id === doomed || parentId === doomed,
        ),
      ).toEqual([]);

      // Concurrent delete and membership edits serialize cleanly without deadlocks or FK 500s.
      const raceExisting = await create("并发归属甲");
      const raceFresh = await create("并发归属乙");
      expect((await save(parentOnly, [newRoot, raceExisting])).status).toBe(
        204,
      );
      const [delExisting, saveExisting, delFresh, batchFresh] =
        await Promise.all([
          remove(raceExisting),
          save(parentOnly, [newRoot, raceExisting]),
          remove(raceFresh),
          batch({
            action: "add-collections",
            itemIds: [parentOnly],
            collectionIds: [raceFresh],
          }),
        ]);
      expect(delExisting.status).toBe(204);
      expect([204, 400]).toContain(saveExisting.status);
      expect(delFresh.status).toBe(204);
      expect([204, 400]).toContain(batchFresh.status);
      expect(await directIds(parentOnly)).toEqual([newRoot]);

      // Uncategorized counts and queries respect item visibility and disappear when categorized.
      const secretUncategorized = await seedItem(
        "matching secret uncategorized",
        8,
        service,
        true,
      );
      const beforePublic = (await collectionTree("public")).uncategorizedCount;
      const beforeAdmin = (await collectionTree("admin")).uncategorizedCount;
      expect(beforeAdmin).toBeGreaterThan(beforePublic);
      expect(
        (
          await list(
            "view=public&serviceLabel=" +
              service +
              "&search=matching&collectionId=uncategorized",
          )
        ).map(({ id }) => id),
      ).toEqual([uncategorized]);
      expect(
        (
          await list(
            "view=admin&serviceLabel=" +
              service +
              "&search=matching&collectionId=uncategorized",
          )
        ).map(({ id }) => id),
      ).toEqual([secretUncategorized, uncategorized]);
      expect((await save(secretUncategorized, [newRoot])).status).toBe(204);
      expect((await collectionTree("admin")).uncategorizedCount).toBe(
        beforeAdmin - 1,
      );
      expect((await collectionTree("public")).uncategorizedCount).toBe(
        beforePublic,
      );
    } finally {
      try {
        await items.delete({ sync_service_id: In([service, otherService]) });
        if (created.length) await collections.delete({ id: In(created) });
      } finally {
        await dataSource.destroy();
      }
    }
  },
  20000,
);
