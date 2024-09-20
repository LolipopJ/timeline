"use client";

import { useEffect, useRef, useState } from "react";
import type { KeyLoader } from "swr";
import useSWR from "swr";
import useSWRInfinite from "swr/infinite";

import { TimelineCurrentDate } from "@/components/TimelineCurrentDate";
import TimelineItemBilibiliCollection from "@/components/TimelineItem/bilibili-collection";
import TimelineItemFeed from "@/components/TimelineItem/feed";
import TimelineItemGithubIssueComment from "@/components/TimelineItem/github-issue-comment";
import TimelineItemLabel from "@/components/TimelineItemLabel";
import TimelineOwner from "@/components/TimelineOwner";
import TimelineProgress from "@/components/TimelineProgress";
import type { TimelineComponent } from "@/interfaces/timeline";
import { fetcherGET } from "@/services/axios";

import { SyncServiceType } from "../../../enums";
import type { TimelineItemClient } from "../../../interfaces/api";

const PAGE_LIMIT = 20;

const getTimelineItemsKey: NonNullable<KeyLoader> = (
  pageIndex,
  previousPageData,
) => {
  if (previousPageData?.length < PAGE_LIMIT) return null;
  return `/timeline-items?page=${pageIndex}&limit=${PAGE_LIMIT}`;
};

export default function Home() {
  const [currenDate, setCurrentDate] = useState<Date>(new Date());
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const loadMoreButtonRef = useRef<HTMLButtonElement>(null);

  const {
    data: timelineItems,
    isLoading: isFirstLoadingTimelineItems,
    isValidating: isValidatingTimelineItems,
    setSize: setQueryTimelineItemsPage,
  } = useSWRInfinite<TimelineItemClient[]>(getTimelineItemsKey, fetcherGET);
  const isFullyLoaded =
    timelineItems &&
    timelineItems[timelineItems.length - 1].length < PAGE_LIMIT;

  const { data: timelineItemsCount = Infinity } = useSWR<number>(
    "/timeline-items/count",
    fetcherGET,
  );

  useEffect(() => {
    if (isValidatingTimelineItems) return;

    const loadMoreButton = loadMoreButtonRef.current;
    if (loadMoreButton) {
      const loadMoreObserver = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setQueryTimelineItemsPage((prev) => prev + 1);
          }
        },
        { threshold: 0 },
      );
      loadMoreObserver.observe(loadMoreButton);
      return () => {
        loadMoreObserver.unobserve(loadMoreButton);
      };
    }
  }, [isValidatingTimelineItems, setQueryTimelineItemsPage]);

  useEffect(() => {
    if (isValidatingTimelineItems) return;

    const timelineItemDOMs = document.querySelectorAll(".timeline-item");
    if (timelineItemDOMs.length) {
      const loadMoreObserver = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            const timelineItemCreateAt =
              entry.target.getAttribute("data-created-at");
            const timelineItemOrderedIndex =
              entry.target.getAttribute("data-ordered-index");
            if (timelineItemCreateAt) {
              const timelineItemCreateAtDate = new Date(timelineItemCreateAt);
              setCurrentDate(timelineItemCreateAtDate);
            }
            if (timelineItemOrderedIndex) {
              setCurrentIndex(Number(timelineItemOrderedIndex));
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
  }, [isValidatingTimelineItems]);

  return (
    <div className="mt-20 max-w-screen-md px-4 py-6 sm:px-6 sm:py-8 md:mx-auto md:mt-24 md:px-8 md:py-10 lg:mt-0">
      {!isFirstLoadingTimelineItems && (
        <>
          <div className="lg:hidden">
            <div
              className={`bg-background-light shadow-background-lighter fixed inset-x-0 top-0 z-10 flex h-20 items-center px-4 shadow-md sm:px-6 md:h-24 md:px-8`}
            >
              <TimelineCurrentDate date={currenDate} />
              <TimelineOwner
                className="ml-auto"
                iconClassName="size-6 md:size-8 text-foreground"
              />
            </div>
          </div>
          <div className="hidden lg:block">
            <div
              className={`fixed -mt-10 flex h-screen -translate-x-full flex-col py-10 pr-6`}
            >
              <TimelineCurrentDate date={currenDate} />
              <TimelineProgress
                total={timelineItemsCount}
                current={currentIndex}
                className="my-20 w-2 flex-auto"
              />
              <TimelineOwner />
            </div>
          </div>
        </>
      )}
      {timelineItems?.map((itemsArray, page) =>
        itemsArray.map((item, index) => {
          const { id, sync_service_type, created_at } = item;
          const orderedIndex = page * PAGE_LIMIT + index + 1;

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
              data-ordered-index={orderedIndex}
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
          onClick={() => setQueryTimelineItemsPage((prev) => prev + 1)}
          disabled={isValidatingTimelineItems}
        >
          {isValidatingTimelineItems ? "加载中..." : "加载更多"}
        </button>
      </div>
    </div>
  );
}
