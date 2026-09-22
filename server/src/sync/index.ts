import config from "../../../configs/server";
import { SyncServiceType } from "../../../enums";
import { createLogger } from "../utils/logger";
import { syncBilibiliCollections, syncBilibiliWorks } from "./bilibili";
import { syncFeed } from "./feed";
import { syncGithubIssueComments } from "./github";
import { syncQQZoneTalks } from "./qzone";
import { syncSteamGameReviews, syncSteamRecentlyPlayedGames } from "./steam";

const logger = createLogger("Sync");

let isSyncing = false;

/** @param forceFull 强制所有服务执行一次全量同步，忽略各服务自身的 `full` 配置 */
export const sync = async (forceFull = false) => {
  if (isSyncing) {
    logger.warn("Sync is already in progress, skipping this invocation.");
    return;
  }
  isSyncing = true;

  try {
    logger.info(
      forceFull
        ? "Start to execute a full sync of all data."
        : "Start to execute sync tasks.",
    );

    const { services = [] } = config;
    const syncTasks = services
      .filter((service) => service.enabled !== false)
      .map((service) => {
        const effectiveService = forceFull
          ? { ...service, full: true }
          : service;

        switch (effectiveService.type) {
          case SyncServiceType.BILIBILI_COLLECTION:
            return syncBilibiliCollections(effectiveService);
          case SyncServiceType.BILIBILI_WORK:
            return syncBilibiliWorks(effectiveService);
          case SyncServiceType.FEED:
            return syncFeed(effectiveService);
          case SyncServiceType.GITHUB_ISSUE_COMMENT:
            return syncGithubIssueComments(effectiveService);
          case SyncServiceType.QZONE_TALK:
            return syncQQZoneTalks(effectiveService);
          case SyncServiceType.STEAM_RECENTLY_PLAYED_TIME:
            return syncSteamRecentlyPlayedGames(effectiveService);
          case SyncServiceType.STEAM_GAME_REVIEW:
            return syncSteamGameReviews(effectiveService);
          default:
            return Promise.reject(
              // @ts-expect-error: throw an error if user provide a unknown type
              `Sync service type \`${effectiveService.type}\` is not supported.`,
            );
        }
      });

    const results = await Promise.allSettled(syncTasks);

    results.forEach((result, index) => {
      if (result.status === "rejected") {
        logger.error(
          `Sync task ${JSON.stringify(services[index])} failed:\n${result.reason}`,
        );
      }
    });

    const failedCount = results.filter((r) => r.status === "rejected").length;
    if (failedCount > 0) {
      logger.error(
        `Sync tasks completed with ${failedCount} failure${failedCount > 1 ? "s" : ""}.`,
      );
    } else {
      logger.success("Sync tasks fulfilled!");
    }
  } catch (error) {
    logger.error(`An error occurred while doing sync tasks:\n${error}`);
  } finally {
    isSyncing = false;
  }
};

export default sync;
