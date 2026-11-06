import type { RestEndpointMethodTypes } from "@octokit/plugin-rest-endpoint-methods";
import { Octokit } from "octokit";

import {
  getSyncTaskLastExecuteTime,
  insertOrUpdateTimelineItems,
} from "../database/controller/timeline-item";
import type { SyncServiceGithubIssueComment } from "../types/config";
import { createLogger } from "../utils/logger";

const logger = createLogger("GitHub");

const getGithubAccountId = async (octokit: Octokit) => {
  try {
    const { data } = await octokit.rest.users.getAuthenticated();
    logger.success(
      `Auth to Github successfully! You are logged as ${data.login}.`,
    );
    return data.id;
  } catch (error) {
    throw new Error(
      "Auth to Github failed: check githubPersonalAccessToken on this service.",
      { cause: error },
    );
  }
};

export const syncGithubIssueComments = async (
  service: SyncServiceGithubIssueComment,
) => {
  const {
    id,
    type,
    from,
    secret,
    owner,
    repo,
    issueNumber,
    full,
    githubPersonalAccessToken,
  } = service;
  const PER_PAGE = 30;

  if (!githubPersonalAccessToken)
    throw new Error("Configure githubPersonalAccessToken on this service.");
  const octokit = new Octokit({ auth: githubPersonalAccessToken });
  const currentUserId = await getGithubAccountId(octokit);

  const lastExecuteDate = await getSyncTaskLastExecuteTime({
    id,
    from,
    full,
  });
  logger.info(
    `Syncing Github issue comments from ${owner}/${repo}/${issueNumber} since ${lastExecuteDate.toISOString()}...`,
  );

  const comments: RestEndpointMethodTypes["issues"]["listComments"]["response"]["data"] =
    [];
  let queryFinished = false;
  let page = 1;
  while (!queryFinished) {
    const { data: queriedComments } = await octokit.rest.issues.listComments({
      owner,
      repo,
      issue_number: issueNumber,
      since: new Date(lastExecuteDate.getTime() + 1).toISOString(),
      page,
      per_page: PER_PAGE,
    });
    comments.push(
      ...queriedComments.filter(
        (queriedComment) => queriedComment.user?.id === currentUserId,
      ),
    );

    if (queriedComments.length === PER_PAGE) {
      page += 1;
    } else {
      queryFinished = true;
    }
  }
  logger.info(
    `Synced ${comments.length} Github issue comments from ${owner}/${repo}/${issueNumber}.`,
  );

  const itemCount = await insertOrUpdateTimelineItems(
    comments.map((comment) => ({
      sync_service_id: id,
      sync_service_type: type,
      content_id: String(comment.id),
      content: String(comment.body),
      url: comment.html_url,
      metadata: JSON.stringify(comment),
      is_secret: secret,
      created_at: new Date(comment.created_at),
      updated_at: new Date(comment.updated_at),
    })),
  );
  logger.success(
    `Insert or update ${itemCount} timeline items of Github issue comments from ${owner}/${repo}/${issueNumber} successfully!`,
  );
  return itemCount;
};
