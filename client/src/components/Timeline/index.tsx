"use client";
import type { KeyLoader } from "swr";
import useSWRInfinite from "swr/infinite";

import type { TimelineComponent } from "@/interfaces/timeline";
import { fetcherGET } from "@/services/axios";
import { parseMarkdownToHtml } from "@/utils/marked";

import { SyncServiceType } from "../../../../enums";
import type { TimelineItemClient } from "../../../../interfaces/api";
import TimelineItemBilibiliCollection from "./bilibili-collection";
import TimelineItemFeed from "./feed";
import TimelineItemGithubIssueComment from "./github-issue-comment";

const PAGE_LIMIT = 20;

const getTimelineItemsKey: NonNullable<KeyLoader> = (
  pageIndex,
  previousPageData,
) => {
  if (previousPageData?.length < PAGE_LIMIT) return null;
  return `/timeline-items?page=${pageIndex}&limit=${PAGE_LIMIT}`;
};

export default function Timeline() {
  const {
    data: timelineItems,
    error,
    isLoading,
    isValidating,
    mutate,
    size,
    setSize,
  } = useSWRInfinite<TimelineItemClient[]>(getTimelineItemsKey, fetcherGET);

  if (!timelineItems || isLoading) return null;
  const isFullLoaded =
    timelineItems[timelineItems.length - 1].length < PAGE_LIMIT;

  return (
    <div className="">
      {timelineItems.map((itemsArray) =>
        itemsArray.map((item) => {
          const itemProps: TimelineComponent = {
            item,
            ["data-id"]: item.id,
            ["data-type"]: item.sync_service_type,
            className: "mb-8 rounded-lg overflow-hidden",
          };

          if (item.sync_service_type === SyncServiceType.BILIBILI_COLLECTION) {
            return (
              <TimelineItemBilibiliCollection key={item.id} {...itemProps} />
            );
          }

          if (item.sync_service_type === SyncServiceType.FEED) {
            return <TimelineItemFeed key={item.id} {...itemProps} />;
          }

          if (item.sync_service_type === SyncServiceType.GITHUB_ISSUE_COMMENT) {
            return (
              <TimelineItemGithubIssueComment key={item.id} {...itemProps} />
            );
          }

          return null;
        }),
      )}
      {!isFullLoaded && (
        <button onClick={() => setSize(size + 1)} disabled={isLoading}>
          加载更多
        </button>
      )}
    </div>
  );
}
