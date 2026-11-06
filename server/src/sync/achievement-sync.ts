import type { GameAchievementDto } from "@timeline/contracts";

import {
  achievementSourceId,
  beginAchievementRun,
  commitAchievementRun,
  failAchievementRun,
  getAchievementSnapshots,
} from "../database/controller/game-achievement";
import type { SyncServiceBase } from "../types/config";
import { createLogger } from "../utils/logger";
import type { GameSummary, NormalizedGame } from "./achievement";
import {
  calculateMilestones,
  normalizeAchievementAccount,
  selectAchievementGames,
  validUnlockDate,
} from "./achievement";

export const syncGameAchievements = async (
  service: SyncServiceBase,
  platform: GameAchievementDto["platform"],
  accountId: string,
  getSummaries: () => Promise<GameSummary[]>,
  getDetails: (games: GameSummary[]) => Promise<NormalizedGame[]>,
) => {
  const account = normalizeAchievementAccount(accountId);
  const sourceId = achievementSourceId(service.id, platform, account);
  const logger = createLogger(`Achievements:${service.id}`);
  const state = await beginAchievementRun(sourceId);
  try {
    const previous = await getAchievementSnapshots(sourceId);
    const summaries = await getSummaries();
    if (new Set(summaries.map((s) => s.gameId)).size !== summaries.length)
      throw new Error("Duplicate game summaries.");
    const selection = selectAchievementGames(
      summaries,
      previous.map((s) => s.summary),
      state.rotation_cursor,
      service.full ?? false,
    );
    const checked: { summary: GameSummary; game: NormalizedGame }[] = [];
    // One bounded batch shares authorization; no request or subprocess runs inside the transaction.
    for (let offset = 0; offset < selection.games.length; offset += 20) {
      const batch = selection.games.slice(offset, offset + 20);
      const details = await getDetails(batch);
      const returned = new Map(details.map((g) => [g.gameId, g]));
      if (
        returned.size !== batch.length ||
        details.length !== batch.length ||
        batch.some((s) => !returned.has(s.gameId))
      )
        throw new Error("Incomplete achievement detail batch.");
      for (const summary of batch) {
        const game = returned.get(summary.gameId)!;
        const milestones = calculateMilestones(platform, account, game);
        if (
          game.achievements.some(
            (a) => a.unlocked && !validUnlockDate(a.unlockedAt),
          ) ||
          (game.achievements.length > 0 &&
            game.achievements.every((a) => a.unlocked) &&
            !milestones.some((m) => m.slot === "all"))
        ) {
          logger.warn(
            `Game ${game.gameId}: completion date unavailable; retain history and recheck.`,
          );
        }
        checked.push({ summary, game });
      }
    }
    const count = await commitAchievementRun(
      state,
      service,
      platform,
      account,
      checked,
      selection.cursor,
    );
    logger.success(
      `Checked ${checked.length}/${summaries.length} games; wrote ${count} milestones.`,
    );
    return count;
  } catch (error) {
    await failAchievementRun(sourceId);
    // External collectors sanitize errors before this boundary; never attach raw responses or causes.
    throw error;
  }
};
