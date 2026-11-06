import type { GameAchievementDto } from "@timeline/contracts";

import type { GameSummary, NormalizedGame } from "../../sync/achievement";
import {
  achievementFingerprint,
  calculateMilestones,
  normalizeAchievementAccount,
  validUnlockDate,
} from "../../sync/achievement";
import type { SyncServiceBase } from "../../types/config";
import {
  AchievementGameSnapshot,
  AchievementSourceState,
} from "../entity/achievement-state";
import TimelineItem from "../entity/timeline-item";
import dataSource from "../index";

export const achievementSourceId = (
  serviceId: string,
  platform: GameAchievementDto["platform"],
  account: string,
) =>
  JSON.stringify([serviceId, platform, normalizeAchievementAccount(account)]);

export const beginAchievementRun = async (id: string) => {
  const repo = dataSource.getRepository(AchievementSourceState);
  const previous = await repo.findOneBy({ id });
  const state = repo.create({
    id,
    started_at: new Date(),
    finished_at: null,
    result: "running",
    successful_at: previous?.successful_at ?? null,
    rotation_cursor: previous?.rotation_cursor ?? null,
  });
  await repo.save(state);
  return state;
};

export const failAchievementRun = async (id: string) => {
  await dataSource.getRepository(AchievementSourceState).update(
    { id },
    {
      result: "failure",
      finished_at: new Date(),
    },
  );
};

export const getAchievementSnapshots = (sourceId: string) =>
  dataSource
    .getRepository(AchievementGameSnapshot)
    .findBy({ source_id: sourceId });

const milestoneNames = {
  platinum: "白金奖杯",
  mythic: "Mythic",
  base_completion: "本体全成就",
  all_achievements: "全成就",
};

export const commitAchievementRun = async (
  state: AchievementSourceState,
  service: SyncServiceBase,
  platform: GameAchievementDto["platform"],
  account: string,
  checked: { summary: GameSummary; game: NormalizedGame }[],
  cursor: string | null,
) =>
  dataSource.transaction(async (manager) => {
    let count = 0;
    const items = manager.getRepository(TimelineItem);
    for (const { summary, game } of checked) {
      for (const milestone of calculateMilestones(platform, account, game)) {
        const date = new Date(milestone.createdAt);
        if (date < (service.from ?? new Date(0))) continue;
        const key = {
          sync_service_id: service.id,
          content_id: milestone.contentId,
        };
        const existing = await items.findOne({ where: key, withDeleted: true });
        // Base is a one-time event. Preserve historical completions if later definitions shrink.
        if (
          existing &&
          (milestone.slot === "base" || existing.created_at > date)
        )
          continue;
        if (existing && existing.created_at.getTime() === date.getTime()) {
          if (!existing.metadata) continue;
          const recordedIds: string[] = JSON.parse(existing.metadata);
          const recorded = new Set(recordedIds);
          const newCompletion = game.achievements.some(
            (a) =>
              !recorded.has(a.id) &&
              validUnlockDate(a.unlockedAt) === milestone.createdAt,
          );
          if (!newCompletion) continue;
        }
        const values = {
          ...key,
          sync_service_type: service.type,
          title: game.title,
          content: milestoneNames[milestone.achievement.kind],
          url: game.url ?? null,
          attachments: game.coverUrl
            ? [{ filename: "cover.jpg", url: game.coverUrl }]
            : [],
          achievement: milestone.achievement,
          achievement_merged: milestone.merged,
          // Keep the IDs at the recorded completion even as observations change.
          metadata:
            milestone.slot === "all"
              ? JSON.stringify(game.achievements.map((a) => a.id))
              : undefined,
          created_at: date,
        };
        // Only collector-owned columns are updated. Never restore or overwrite administrator state.
        if (existing)
          await items.update(key, { ...values, updated_at: new Date() });
        else
          await items.insert({
            ...values,
            is_secret: service.secret ?? false,
            updated_at: date,
          });
        count++;
      }
      await manager.getRepository(AchievementGameSnapshot).save({
        source_id: state.id,
        game_id: game.gameId,
        summary,
        game,
        definition_fingerprint: achievementFingerprint({
          achievements: game.achievements
            .map(({ id, groupId }) => [id, groupId])
            .sort(),
          base: game.base,
        }),
        checked_at: new Date(),
      });
    }
    await manager.getRepository(AchievementSourceState).update(
      { id: state.id },
      {
        result: "success",
        successful_at: state.started_at,
        finished_at: new Date(),
        rotation_cursor: cursor,
      },
    );
    return count;
  });
