import { SyncServiceType } from "@timeline/contracts";

import config from "../../configs/server";
import type { SyncService } from "../types/config";
import { syncBilibiliCollections, syncBilibiliWorks } from "./bilibili";
import { createSyncCoordinator } from "./coordinator";
import { syncFeed } from "./feed";
import { syncGithubIssueComments } from "./github";
import { syncQQZoneTalks } from "./qzone";
import { syncSteamGameReviews, syncSteamRecentlyPlayedGames } from "./steam";

const executeService = (service: SyncService) => {
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
      throw new Error("Unsupported sync service type.");
  }
};

export const syncCoordinator = createSyncCoordinator(
  () => config.services,
  executeService,
);
