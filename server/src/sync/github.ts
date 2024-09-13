import type { RestEndpointMethodTypes } from "@octokit/plugin-rest-endpoint-methods";
import { Octokit } from "octokit";

import config from "../../../config/server";
import type { SyncServiceGithubIssueComment } from "../../../interface";
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
    console.info(
      `Auth to Github successfully! You are logged as ${data.login}.`,
    );

    githubAccountDetails = data;
  }

  return githubAccountDetails;
};

export const syncGithubIssueComments = async (
  options: SyncServiceGithubIssueComment,
) => {
  const { id, type, from, owner, repo, issueNumber } = options;
  const PER_PAGE = 30;

  const { id: currentUserId } = await getGithubAccountDetails();

  const lastExecuteDate = await getSyncTaskLastExecuteTime({
    id,
    from,
  });
  const since = new Date(lastExecuteDate.getTime() + 1).toISOString();
  console.log(
    `Syncing Github issue comments from ${owner}/${repo}/${issueNumber} since ${since}...`,
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
      since,
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
    `Synced ${comments.length} Github issue comments from ${owner}/${repo}/${issueNumber} since ${since}.`,
  );

  const res = await insertOrUpdateTimelineItems(
    comments.map((comment) => ({
      content_id: String(comment.id),
      sync_service_id: id,
      sync_service_type: type,
      content: String(comment.body),
      url: comment.html_url,
      created_at: new Date(comment.created_at),
      updated_at: new Date(comment.updated_at),
    })),
  );
  console.log(
    `Insert or update ${comments.length} timeline items of Github issue comments from ${owner}/${repo}/${issueNumber} since ${since} successfully!`,
  );

  return res;
};
