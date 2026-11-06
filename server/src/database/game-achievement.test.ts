import "reflect-metadata";

import { randomUUID } from "node:crypto";

import { SyncServiceType } from "@timeline/contracts";
import { expect, test } from "bun:test";

import { serializeTimelineItem } from "../api/serializers";
import { getTimelineWhere } from "../api/timeline-query";
import type { GameSummary, NormalizedGame } from "../sync/achievement";
import { syncGameAchievements } from "../sync/achievement-sync";
import { createSyncCoordinator } from "../sync/coordinator";
import type { SyncService } from "../types/config";
import {
  achievementSourceId,
  beginAchievementRun,
  commitAchievementRun,
  getAchievementSnapshots,
} from "./controller/game-achievement";
import {
  AchievementGameSnapshot,
  AchievementSourceState,
} from "./entity/achievement-state";
import TimelineItem from "./entity/timeline-item";
import dataSource, { DATABASE_NAME } from "./index";

const databaseTest = process.env.NODE_ENV === "development" ? test : test.skip;

databaseTest(
  "achievement commits, restart, visibility, history and rollback use the development database",
  async () => {
    expect(DATABASE_NAME.endsWith("_dev")).toBe(true);
    await dataSource.initialize();
    const service = {
      id: `achievement-check-${randomUUID()}`,
      type: SyncServiceType.PSN_GAME_ACHIEVEMENT,
    };
    const sourceId = achievementSourceId(service.id, "psn", "1");
    const date = "2020-01-01T00:00:00.000Z";
    const summary: GameSummary = {
      gameId: "fixture",
      title: "Game achievement fixture",
      signature: "v1",
    };
    const game: NormalizedGame = {
      ...summary,
      achievements: [
        {
          id: "platinum",
          groupId: "default",
          unlocked: true,
          unlockedAt: date,
        },
      ],
      base: { kind: "platinum", achievementId: "platinum" },
    };
    const run = (
      summaries: GameSummary[],
      details: NormalizedGame[],
      extra = {},
    ) =>
      syncGameAchievements(
        { ...service, ...extra },
        "psn",
        "1",
        async () => summaries,
        async () => details,
      );
    try {
      expect(await run([], [])).toBe(0);
      const zeroSuccess = await dataSource
        .getRepository(AchievementSourceState)
        .findOneByOrFail({ id: sourceId });
      expect(zeroSuccess.result).toBe("success");
      expect(zeroSuccess.successful_at).toBeInstanceOf(Date);
      await dataSource.destroy();
      await dataSource.initialize();
      expect(
        (
          await dataSource
            .getRepository(AchievementSourceState)
            .findOneByOrFail({ id: sourceId })
        ).successful_at,
      ).toEqual(zeroSuccess.successful_at);
      expect(await run([summary], [game])).toBe(2);
      const repo = dataSource.getRepository(TimelineItem);
      const where = getTimelineWhere({ serviceLabel: service.id }, false);
      expect(await repo.count({ where })).toBe(1);
      const visible = await repo.find({ where });
      expect(visible).toHaveLength(1);
      expect(serializeTimelineItem(visible[0]!)).toMatchObject({
        achievement: { kind: "platinum" },
        created_at: date,
      });
      expect(serializeTimelineItem(visible[0]!)).not.toHaveProperty(
        "achievement_merged",
      );
      const all = await repo.findOneByOrFail({
        sync_service_id: service.id,
        achievement_merged: true,
      });
      expect(
        await repo.count({ where: getTimelineWhere({ id: all.id }, true) }),
      ).toBe(0);
      const lateDlc = { id: "late-dlc", groupId: "001", unlocked: true };
      const lateSummary = { ...summary, signature: "late-dlc" };
      await run(
        [lateSummary],
        [{ ...game, achievements: [...game.achievements, lateDlc] }],
      );
      await run(
        [lateSummary],
        [
          {
            ...game,
            achievements: [
              ...game.achievements,
              { ...lateDlc, unlockedAt: date },
            ],
          },
        ],
      );
      expect(await repo.findOneByOrFail({ id: all.id })).toMatchObject({
        achievement_merged: false,
        achievement: { totalCount: 2 },
      });
      await repo.update({ id: visible[0]!.id }, { is_secret: true });
      expect(
        await repo.count({
          where: getTimelineWhere({ id: visible[0]!.id }, false),
        }),
      ).toBe(0);
      expect(
        await repo.count({
          where: getTimelineWhere({ id: visible[0]!.id }, true),
        }),
      ).toBe(1);
      await repo.update({ id: all.id }, { is_secret: true });
      await repo.softDelete({ id: all.id });
      const appended = {
        ...game,
        achievements: [
          ...game.achievements,
          {
            id: "dlc",
            groupId: "001",
            unlocked: true,
            unlockedAt: "2021-01-01T00:00:00Z",
          },
        ],
      };
      await run([{ ...summary, signature: "v2" }], [appended], { full: true });
      const deleted = await repo.findOneOrFail({
        where: { id: all.id },
        withDeleted: true,
      });
      expect(deleted.deleted_at).toBeInstanceOf(Date);
      expect(deleted.is_secret).toBe(true);
      expect(deleted.achievement_merged).toBe(false);
      expect(deleted.created_at.toISOString()).toBe("2021-01-01T00:00:00.000Z");
      expect(
        (
          await repo.findOneByOrFail({ id: visible[0]!.id })
        ).created_at.toISOString(),
      ).toBe(date);
      await run(
        [{ ...summary, signature: "shrink" }],
        [{ ...appended, achievements: [appended.achievements[1]!] }],
      );
      expect(
        (await repo.findOneOrFail({ where: { id: all.id }, withDeleted: true }))
          .achievement?.totalCount,
      ).toBe(2);
      await run(
        [{ ...summary, signature: "same-second-new-unlock" }],
        [
          {
            ...appended,
            achievements: [
              ...appended.achievements,
              {
                id: "same-second-dlc",
                groupId: "002",
                unlocked: true,
                unlockedAt: "2021-01-01T00:00:00Z",
              },
            ],
          },
        ],
      );
      expect(
        (await repo.findOneOrFail({ where: { id: all.id }, withDeleted: true }))
          .achievement?.totalCount,
      ).toBe(3);
      await run([{ ...summary, signature: "smaller-definition" }], [game]);
      await run(
        [{ ...summary, signature: "returning-historical-unlock" }],
        [appended],
      );
      expect(
        (await repo.findOneOrFail({ where: { id: all.id }, withDeleted: true }))
          .achievement?.totalCount,
      ).toBe(3);
      const before = await dataSource
        .getRepository(AchievementSourceState)
        .findOneByOrFail({ id: sourceId });
      const attempt = await beginAchievementRun(sourceId);
      const brokenState = { ...attempt, started_at: new Date(NaN) };
      await expect(
        commitAchievementRun(
          brokenState,
          service,
          "psn",
          "1",
          [
            {
              summary: { ...summary, gameId: "rollback" },
              game: { ...game, gameId: "rollback" },
            },
          ],
          "rollback",
        ),
      ).rejects.toThrow();
      expect(
        (
          await dataSource
            .getRepository(AchievementSourceState)
            .findOneByOrFail({ id: sourceId })
        ).successful_at,
      ).toEqual(before.successful_at);
      expect(
        await repo.countBy({
          sync_service_id: service.id,
          title: "Game achievement fixture",
        }),
      ).toBe(1);
      expect(
        (await getAchievementSnapshots(sourceId)).map((g) => g.game_id),
      ).toEqual(["fixture"]);
      await expect(
        run([{ ...summary, signature: "failed" }], []),
      ).rejects.toThrow("Incomplete");
      const failure = await dataSource
        .getRepository(AchievementSourceState)
        .findOneByOrFail({ id: sourceId });
      expect(failure.result).toBe("failure");
      expect(failure.successful_at).toEqual(before.successful_at);
      expect(
        await run(
          [{ ...summary, signature: "v3" }],
          [
            {
              ...appended,
              achievements: [
                ...appended.achievements,
                { id: "not-yet", unlocked: false },
              ],
            },
          ],
          { from: new Date("2022-01-01"), full: true },
        ),
      ).toBe(0);
      expect(
        (
          await repo.findOneOrFail({ where: { id: all.id }, withDeleted: true })
        ).created_at.toISOString(),
      ).toBe("2021-01-01T00:00:00.000Z");
    } finally {
      await dataSource
        .getRepository(TimelineItem)
        .delete({ sync_service_id: service.id });
      await dataSource
        .getRepository(AchievementGameSnapshot)
        .delete({ source_id: sourceId });
      await dataSource
        .getRepository(AchievementSourceState)
        .delete({ id: sourceId });
      await dataSource.destroy();
    }
  },
  30_000,
);

databaseTest(
  "rotation finds late old unlocks; three sources isolate failures and checkpoints",
  async () => {
    await dataSource.initialize();
    const prefix = `achievement-rotation-${randomUUID()}`;
    const services: SyncService[] = [
      {
        id: `${prefix}-psn`,
        type: SyncServiceType.PSN_GAME_ACHIEVEMENT,
        psnNpsso: "fixture-npsso",
        accountId: "1",
      },
      {
        id: `${prefix}-xbox`,
        type: SyncServiceType.XBOX_GAME_ACHIEVEMENT,
        xboxClientId: "fixture-client",
        xboxClientSecret: "fixture-secret",
        xboxTokenStorePath: "fixture-oauth.json",
        xuid: "1",
      },
      {
        id: `${prefix}-steam`,
        type: SyncServiceType.STEAM_GAME_ACHIEVEMENT,
        steamWebAPIKey: "fixture-key",
        steamId: "1",
        from: new Date("2020-06-01"),
      },
    ];
    const catalog = Array.from({ length: 13 }, (_, i) => ({
      gameId: String(i).padStart(2, "0"),
      title: "Same game",
      signature: "unchanged",
    }));
    const base = services[0]!;
    let late = false;
    const sizes: number[] = [];
    const details = async (games: GameSummary[]) => {
      sizes.push(games.length);
      return games.map((summary) => ({
        ...summary,
        achievements:
          late && summary.gameId === "12"
            ? [
                {
                  id: "late",
                  unlocked: true,
                  unlockedAt: "2020-01-01T00:00:00Z",
                },
              ]
            : [],
      }));
    };
    const sourceKeys = services.map((s, i) =>
      achievementSourceId(s.id, (["psn", "xbox", "steam"] as const)[i]!, "1"),
    );
    try {
      await syncGameAchievements(
        base,
        "psn",
        "1",
        async () => catalog,
        details,
      );
      expect(sizes).toEqual([13]);
      late = true;
      for (let round = 0; round < 3; round++)
        await syncGameAchievements(
          base,
          "psn",
          "1",
          async () => catalog,
          details,
        );
      expect(sizes.slice(1).every((size) => size === 5)).toBe(true);
      const oldUnlock = await dataSource
        .getRepository(TimelineItem)
        .findOneByOrFail({ sync_service_id: base.id });
      expect(oldUnlock.created_at.toISOString()).toBe(
        "2020-01-01T00:00:00.000Z",
      );
      await syncGameAchievements(
        { ...base, full: true },
        "psn",
        "1",
        async () => catalog,
        details,
      );
      expect(sizes.at(-1)).toBe(13);
      const coordinator = createSyncCoordinator(
        () => services,
        async (service) => {
          const platform =
            service.type === SyncServiceType.PSN_GAME_ACHIEVEMENT
              ? "psn"
              : service.type === SyncServiceType.XBOX_GAME_ACHIEVEMENT
                ? "xbox"
                : "steam";
          return syncGameAchievements(
            service,
            platform,
            "1",
            async () => {
              if (platform === "xbox") throw new Error("XBOX_AUTH_REQUIRED");
              return [catalog[0]!];
            },
            async (games) =>
              games.map((g) => ({
                ...g,
                achievements: [
                  {
                    id: "old",
                    unlocked: true,
                    unlockedAt: "2010-01-01T00:00:00Z",
                  },
                  {
                    id: "recent",
                    unlocked: true,
                    unlockedAt: "2021-01-01T00:00:00Z",
                  },
                ],
              })),
          );
        },
      );
      services[0] = { ...base, enabled: false };
      coordinator.ready();
      expect(coordinator.start("manual")).toHaveProperty("runId");
      await coordinator.wait();
      expect(coordinator.snapshot().history[0]?.status).toBe("partial");
      expect(coordinator.snapshot().history[0]?.services).toHaveLength(2);
      const states = await dataSource
        .getRepository(AchievementSourceState)
        .find();
      expect(states.find((s) => s.id === sourceKeys[1])?.result).toBe(
        "failure",
      );
      expect(
        states.find((s) => s.id === sourceKeys[1])?.successful_at,
      ).toBeNull();
      expect(states.find((s) => s.id === sourceKeys[2])?.result).toBe(
        "success",
      );
      expect(
        (
          await dataSource
            .getRepository(TimelineItem)
            .findOneByOrFail({ sync_service_id: services[2]!.id })
        ).created_at.toISOString(),
      ).toBe("2021-01-01T00:00:00.000Z");
      services[0] = { ...base, enabled: true };
      expect(coordinator.start("scheduled")).toHaveProperty("runId");
      await coordinator.wait();
      expect(coordinator.snapshot().history[0]?.services).toHaveLength(3);
      expect(coordinator.snapshot().history[0]?.status).toBe("partial");
    } finally {
      for (let i = 0; i < services.length; i++) {
        await dataSource
          .getRepository(TimelineItem)
          .delete({ sync_service_id: services[i]!.id });
        await dataSource
          .getRepository(AchievementGameSnapshot)
          .delete({ source_id: sourceKeys[i]! });
        await dataSource
          .getRepository(AchievementSourceState)
          .delete({ id: sourceKeys[i]! });
      }
      await dataSource.destroy();
    }
  },
  30_000,
);
