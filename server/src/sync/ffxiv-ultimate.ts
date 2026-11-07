import axios from "axios";
import { load } from "cheerio";

import { insertNewTimelineItems } from "../database/controller/timeline-item";
import type TimelineItem from "../database/entity/timeline-item";
import type { SyncServiceFfxivUltimateAchievement } from "../types/config";
import { createLogger } from "../utils/logger";

const ultimateIds = [1993, 2107, 2444, 3074, 3162, 3617, 4069];
const logger = createLogger("FFXIV Ultimate");

export function parseFfxivUltimate(html: string) {
  const $ = load(html);
  const detail = $(".achievement__view .entry__achievement__view");
  if (detail.length !== 1)
    throw new Error("Achievement detail unavailable. Check Lodestone privacy.");
  if (!detail.hasClass("entry__achievement__view--complete")) return null;

  const name = detail
    .find(".entry__achievement--history .entry__activity__txt")
    .text()
    .trim();
  const rewardTitle = detail
    .closest(".achievement__view")
    .find(".achievement__base--title + .achievement__base--text")
    .text()
    .trim();
  // Lodestone formats the time in the browser. Read the Unix seconds without running its script.
  const seconds = detail
    .find("time.entry__activity__time script")
    .text()
    .match(/\bldst_strftime\(\s*([1-9]\d*)\s*,/)?.[1];
  const completedAt = new Date(Number(seconds) * 1000);
  if (!name || !rewardTitle || !Number.isFinite(completedAt.getTime()))
    throw new Error("Missing or invalid completion data on Lodestone.");

  return { name, rewardTitle, completedAt };
}

export async function syncFfxivUltimateAchievements(
  service: SyncServiceFfxivUltimateAchievement,
) {
  const { id, type, characterId, from, secret } = service;
  const clears: TimelineItem[] = [];

  for (const achievementId of ultimateIds) {
    const url = `https://jp.finalfantasyxiv.com/lodestone/character/${characterId}/achievement/detail/${achievementId}/`;
    try {
      const { data } = await axios.get<string>(url, {
        responseType: "text",
        maxRedirects: 0,
        timeout: 15_000,
      });
      const clear = parseFfxivUltimate(data);
      if (clear) {
        clears.push({
          sync_service_id: id,
          sync_service_type: type,
          content_id: `${characterId}:${achievementId}`,
          title: clear.name,
          content: clear.rewardTitle,
          url,
          is_secret: secret ?? false,
          created_at: clear.completedAt,
          updated_at: clear.completedAt,
        });
      }
    } catch (error) {
      throw new Error(
        `Lodestone character ${characterId}, achievement ${achievementId} could not be read.`,
        {
          cause: error,
        },
      );
    }
  }

  const count = await insertNewTimelineItems(
    from ? clears.filter((item) => item.created_at >= from) : clears,
  );
  logger.success(
    `Character ${characterId}: ${clears.length}/${ultimateIds.length} Ultimate raids cleared, ${count} new timeline items.`,
  );
  return count;
}
