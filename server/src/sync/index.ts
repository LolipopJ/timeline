import config from "../../../configs/server";
import { SyncServiceType } from "../../../enums";
import { syncBilibiliCollections, syncBilibiliWorks } from "./bilibili";
import { syncFeed } from "./feed";
import { syncGithubIssueComments } from "./github";
import { syncQQZoneTalks } from "./qzone";
import { syncSteamGameReviews, syncSteamRecentlyPlayedGames } from "./steam";

export const sync = async () => {
  try {
    console.log("Start to execute sync tasks.");

    const { services = [] } = config;
    const syncTasks = services
      .filter((service) => service.enabled !== false)
      .map((service) => {
        switch (service.type) {
          case SyncServiceType.BILIBILI_COLLECTION:
            return syncBilibiliCollections(service);
          case SyncServiceType.BILIBILI_WORK:
            return syncBilibiliWorks(service);
          case SyncServiceType.FEED:
            return syncFeed(service);
          case SyncServiceType.GITHUB_ISSUE_COMMENT:
            return syncGithubIssueComments(service);
          case SyncServiceType.QZONE_TALK:
            return syncQQZoneTalks(service);
          case SyncServiceType.STEAM_RECENTLY_PLAYED_TIME:
            return syncSteamRecentlyPlayedGames(service);
          case SyncServiceType.STEAM_GAME_REVIEW:
            return syncSteamGameReviews(service);
          default:
            return Promise.reject(
              // @ts-expect-error: throw an error if user provide a unknown type
              `Sync service type \`${service.type}\` is not supported.`,
            );
        }
      });

    const results = await Promise.allSettled(syncTasks);

    results.forEach((result, index) => {
      if (result.status === "rejected") {
        console.error(
          `Sync task ${JSON.stringify(services[index])} failed:\n${result.reason}`,
        );
      }
    });

    const failedCount = results.filter((r) => r.status === "rejected").length;
    if (failedCount > 0) {
      console.error(
        `Sync tasks completed with ${failedCount} failure${failedCount > 1 ? "s" : ""}.`,
      );
    } else {
      console.log("Sync tasks fulfilled!");
    }
  } catch (error) {
    console.error(`An error occurred while doing sync tasks:\n${error}`);
  }
};

export default sync;
