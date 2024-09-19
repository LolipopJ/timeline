"use client";
import { useEffect, useRef } from "react";
import type { KeyLoader } from "swr";
import useSWRInfinite from "swr/infinite";

import type { TimelineComponent } from "@/interfaces/timeline";
import { fetcherGET } from "@/services/axios";

import { SyncServiceType } from "../../../../enums";
import type { TimelineItemClient } from "../../../../interfaces/api";
import TimelineItemBilibiliCollection from "./bilibili-collection";
import TimelineItemFeed from "./feed";
import TimelineItemGithubIssueComment from "./github-issue-comment";

export interface TimelineProps {
  className?: string;
}

const PAGE_LIMIT = 20;

const getTimelineItemsKey: NonNullable<KeyLoader> = (
  pageIndex,
  previousPageData,
) => {
  if (previousPageData?.length < PAGE_LIMIT) return null;
  return `/timeline-items?page=${pageIndex}&limit=${PAGE_LIMIT}`;
};

export default function Timeline(props: TimelineProps) {
  const loadMoreButtonRef = useRef<HTMLButtonElement>(null);

  const {
    data: timelineItems,
    // error,
    isLoading,
    isValidating,
    // mutate,
    // size,
    setSize,
  } = useSWRInfinite<TimelineItemClient[]>(getTimelineItemsKey, fetcherGET);
  const isFullyLoaded =
    timelineItems &&
    timelineItems[timelineItems.length - 1].length < PAGE_LIMIT;

  useEffect(() => {
    if (isValidating) return;

    const loadMoreButton = loadMoreButtonRef.current;
    if (loadMoreButton) {
      const loadMoreObserver = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setSize((prev) => prev + 1);
          }
        },
        { threshold: 0 },
      );
      loadMoreObserver.observe(loadMoreButton);
      return () => {
        loadMoreObserver.unobserve(loadMoreButton);
      };
    }
  });

  if (isLoading) return null;

  return (
    <div {...props}>
      {timelineItems?.map((itemsArray) =>
        itemsArray.map((item) => {
          const itemProps: TimelineComponent = {
            item,
            ["data-id"]: item.id,
            ["data-type"]: item.sync_service_type,
            ["data-label"]: item.label,
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
      <div className={`text-center ${isFullyLoaded && "hidden"}`}>
        <button
          ref={loadMoreButtonRef}
          className="bg-background-light hover:bg-background-lighter rounded border-2 px-3 py-2 transition"
          onClick={() => setSize((prev) => prev + 1)}
          disabled={isValidating}
        >
          {isValidating ? "加载中..." : "加载更多"}
        </button>
      </div>
    </div>
  );
}
