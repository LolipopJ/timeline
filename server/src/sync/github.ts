import type { RestEndpointMethodTypes } from "@octokit/plugin-rest-endpoint-methods";
import { Octokit } from "octokit";

import config from "../../../configs/server";
import type { SyncServiceGithubIssueComment } from "../../../interfaces/server";
import {
  getSyncTaskLastExecuteTime,
  insertOrUpdateTimelineItems,
} from "../database/controller/timeline-item";

const octokit = new Octokit({
  auth: config.githubPersonalAccessToken,
});

let githubAccountDetails: RestEndpointMethodTypes["users"]["getAuthenticated"]["response"]["data"];
export const getGithubAccountDetails = async () => {
  if (!githubAccountDetails) {
    const { data } = await octokit.rest.users.getAuthenticated();
    console.log(
      `Auth to Github successfully! You are logged as ${data.login}.`,
    );

    githubAccountDetails = data;
  }

  return githubAccountDetails;
};

export const syncGithubIssueComments = async (
  service: SyncServiceGithubIssueComment,
) => {
  const { id, type, from, owner, repo, issueNumber } = service;
  const PER_PAGE = 30;

  const { id: currentUserId } = await getGithubAccountDetails();

  const lastExecuteDate = await getSyncTaskLastExecuteTime({
    id,
    from,
  });
  console.log(
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
  console.log(
    `Synced ${comments.length} Github issue comments from ${owner}/${repo}/${issueNumber}.`,
  );

  await insertOrUpdateTimelineItems(
    comments.map((comment) => ({
      sync_service_id: id,
      sync_service_type: type,
      content_id: String(comment.id),
      content: String(comment.body),
      url: comment.html_url,
      metadata: JSON.stringify(comment),
      created_at: new Date(comment.created_at),
      updated_at: new Date(comment.updated_at),
    })),
  );
  console.log(
    `Insert or update ${comments.length} timeline items of Github issue comments from ${owner}/${repo}/${issueNumber} successfully!`,
  );
};
