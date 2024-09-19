"use client";
import { useEffect, useRef, useState } from "react";
import type { KeyLoader } from "swr";
import useSWRInfinite from "swr/infinite";

import type { TimelineComponent } from "@/interfaces/timeline";
import { fetcherGET } from "@/services/axios";

import { SyncServiceType } from "../../../../enums";
import type { TimelineItemClient } from "../../../../interfaces/api";
import TimelineItemBilibiliCollection from "./bilibili-collection";
import { TimelineCurrentDate } from "./current-date";
import TimelineItemFeed from "./feed";
import TimelineItemGithubIssueComment from "./github-issue-comment";
import TimelineItemLabel from "./item-label";

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
  const { className = "", ...rest } = props;

  const [currenDate, setCurrentDate] = useState<Date>();
  const loadMoreButtonRef = useRef<HTMLButtonElement>(null);

  const {
    data: timelineItems,
    isValidating,
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
  }, [isValidating, setSize]);

  useEffect(() => {
    if (isValidating) return;

    const timelineItemDOMs = document.querySelectorAll(".timeline-item");
    if (timelineItemDOMs.length) {
      const loadMoreObserver = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            const timelineItemCreateAt =
              entry.target.getAttribute("data-created-at");
            if (timelineItemCreateAt) {
              const timelineItemCreateAtDate = new Date(timelineItemCreateAt);
              setCurrentDate(timelineItemCreateAtDate);
            }
          }
        },
        { threshold: 0 },
      );
      timelineItemDOMs.forEach((dom) => {
        loadMoreObserver.observe(dom);
      });
      return () => {
        timelineItemDOMs.forEach((dom) => {
          loadMoreObserver.unobserve(dom);
        });
      };
    }
  }, [isValidating]);

  return (
    <div className={`${className} relative`} {...rest}>
      {currenDate && <TimelineCurrentDate date={currenDate} />}
      {timelineItems?.map((itemsArray) =>
        itemsArray.map((item) => {
          const { id, sync_service_type, created_at } = item;

          let element = <></>;
          const elementProps: TimelineComponent = {
            item,
            className: "rounded-lg overflow-hidden",
          };

          switch (sync_service_type) {
            case SyncServiceType.BILIBILI_COLLECTION:
              element = <TimelineItemBilibiliCollection {...elementProps} />;
              break;
            case SyncServiceType.FEED:
              element = <TimelineItemFeed {...elementProps} />;
              break;
            case SyncServiceType.GITHUB_ISSUE_COMMENT:
              element = <TimelineItemGithubIssueComment {...elementProps} />;
              break;
            default:
              element = <div>{JSON.stringify(item)}</div>;
              console.warn(
                `Unknown timeline item type \`${sync_service_type}\``,
              );
          }

          return (
            <div
              key={id}
              id={id}
              className="timeline-item relative mb-8 flex flex-col"
              data-created-at={created_at}
            >
              <TimelineItemLabel item={item} />
              {element}
            </div>
          );
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
