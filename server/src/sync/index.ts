import config from "../../../config/server";
import { SyncServiceType } from "../../../enum";
import { syncGithubIssueComments } from "./github";

export const sync = async () => {
  try {
    console.info("Start to execute sync tasks.");

    const { services = [] } = config;
    const syncTasks = services.map((service) => {
      switch (service.type) {
        case SyncServiceType.GITHUB_ISSUE_COMMENT:
          return syncGithubIssueComments(service);
        default:
          throw new Error(
            `Sync service type ${service.type} is not supported.`,
          );
      }
    });
    await Promise.all(syncTasks);

    console.info("Sync tasks fulfilled!");
  } catch (error) {
    console.error("Meet an error while doing sync tasks:\n", error);
  }
};

export default sync;
