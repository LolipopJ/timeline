import config from "../../../config/server";
import { SyncServiceType } from "../../../enum";
import { syncBilibiliCollections } from "./bilibili";
import { syncGithubIssueComments } from "./github";
import { syncRSS } from "./rss";
import { syncSteamRecentlyPlayedGames } from "./steam";

export const sync = async () => {
  try {
    console.log("Start to execute sync tasks.");

    const { services = [] } = config;
    const syncTasks = services.map((service) => {
      switch (service.type) {
        case SyncServiceType.BILIBILI_COLLECTION:
          return syncBilibiliCollections(service);
        case SyncServiceType.GITHUB_ISSUE_COMMENT:
          return syncGithubIssueComments(service);
        case SyncServiceType.RSS:
          return syncRSS(service);
        case SyncServiceType.STEAM_RECENTLY_PLAYED_TIME:
          return syncSteamRecentlyPlayedGames(service);
        default:
          return Promise.reject(
            // @ts-expect-error: throw an error if user provide a unknown type
            `Sync service type \`${service.type}\` is not supported.`,
          );
      }
    });
    await Promise.all(syncTasks);

    console.log("Sync tasks fulfilled!");
  } catch (error) {
    console.error("Meet an error while doing sync tasks:\n", error);
  }
};

export default sync;
