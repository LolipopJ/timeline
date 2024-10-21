"use client";

import { mdiLoading, mdiSlashForwardBox } from "@mdi/js";
import Icon from "@mdi/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyLoader } from "swr";
import useSWR from "swr";
import useSWRInfinite from "swr/infinite";

import message from "@/components/Message";
import { TimelineCurrentDate } from "@/components/TimelineCurrentDate";
import TimelineItem from "@/components/TimelineItem";
import TimelineOwner from "@/components/TimelineOwner";
import TimelineProgress from "@/components/TimelineProgress";
import TimelineSearch, {
  type TimelineSearchProps,
} from "@/components/TimelineSearch";
import useDebounce from "@/hooks/useDebounce";
import { fetcherGET } from "@/services/axios";
import { getSearchParamsFromObject } from "@/utils/searchParams";

import type {
  GetTimelineItemsParams,
  TimelineItemClient,
} from "../../../interfaces/api";

const PAGE_LIMIT = 20;

export default function Home() {
  const [searchParams, setSearchParams] = useState<GetTimelineItemsParams>({
    search: "",
  });
  const debouncedSearchParams = useDebounce(searchParams, 500);

  const [currenDate, setCurrentDate] = useState<Date>(new Date());
  const [currentIndex, setCurrentIndex] = useState<number>(0);

  const loadMoreButtonRef = useRef<HTMLButtonElement>(null);

  const getTimelineItemsKey = useCallback<NonNullable<KeyLoader>>(
    (pageIndex, previousPageData) => {
      if (previousPageData?.length < PAGE_LIMIT) return null;
      return `/timeline-items?${getSearchParamsFromObject({
        ...debouncedSearchParams,
        page: pageIndex,
        limit: PAGE_LIMIT,
      })}`;
    },
    [debouncedSearchParams],
  );
  const {
    data: timelineItems,
    isLoading: isLoadingTimelineItems,
    isValidating: isValidatingTimelineItems,
    setSize: setQueryTimelineItemsPage,
  } = useSWRInfinite<TimelineItemClient[]>(getTimelineItemsKey, fetcherGET);
  const isFullyLoaded =
    timelineItems &&
    timelineItems[timelineItems.length - 1].length < PAGE_LIMIT;

  const getTimelineItemsCountKey = useMemo(() => {
    return `/timeline-items/count?${getSearchParamsFromObject(debouncedSearchParams)}`;
  }, [debouncedSearchParams]);
  const { data: timelineItemsCount = Infinity } = useSWR<number>(
    getTimelineItemsCountKey,
    fetcherGET,
  );

  useEffect(() => {
    if (isLoadingTimelineItems) {
      window.scrollTo({ top: 0 });
    }
  }, [isLoadingTimelineItems]);

  useEffect(() => {
    if (isFullyLoaded || isValidatingTimelineItems) return;

    const loadMoreButton = loadMoreButtonRef.current;
    if (loadMoreButton) {
      const loadMoreObserver = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setQueryTimelineItemsPage((prev) => prev + 1);
            loadMoreObserver.unobserve(loadMoreButton);
          }
        },
        { threshold: 0 },
      );
      loadMoreObserver.observe(loadMoreButton);
      return () => {
        loadMoreObserver.unobserve(loadMoreButton);
      };
    }
  }, [isFullyLoaded, isValidatingTimelineItems, setQueryTimelineItemsPage]);

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

  useEffect(() => {
    // 过滤得到的时间线列表为空时，显示消息提示
    if (timelineItems && timelineItems[0].length === 0) {
      message.info("时间线上没有更多的噜~");
    }
  }, [timelineItems]);

  const timelineSearchProps = useMemo<TimelineSearchProps>(
    () => ({
      onChange: (e) =>
        setSearchParams((prev) => ({ ...prev, search: e.target.value })),
      onClear: () => setSearchParams((prev) => ({ ...prev, search: "" })),
    }),
    [],
  );

  return (
    <div className="mt-20 max-w-screen-md px-4 py-6 sm:px-6 sm:py-8 md:mx-auto md:mt-24 md:px-8 md:py-10 lg:mt-0">
      <>
        <div className="lg:hidden">
          <div
            className={`fixed inset-x-0 top-0 z-10 flex h-20 items-center bg-background-light px-4 shadow-md shadow-background-lighter sm:px-6 md:h-24 md:px-8`}
          >
            <TimelineCurrentDate date={currenDate} className="min-w-28" />
            <TimelineSearch
              {...timelineSearchProps}
              value={searchParams.search}
              className="ml-auto mr-12 hidden w-40 sm:block md:mr-16 md:w-48"
            />
            <TimelineOwner
              className="ml-auto sm:ml-0"
              iconClassName="size-6 sm:size-8 text-foreground"
            />
          </div>
        </div>
        <div className="hidden lg:block">
          <div
            className={`fixed -mt-10 flex h-screen w-40 -translate-x-full flex-col py-10 pr-10 2xl:w-48 2xl:pr-12`}
          >
            <TimelineCurrentDate date={currenDate} />
            <TimelineSearch
              {...timelineSearchProps}
              value={searchParams.search}
              className="-ml-1.5 mt-6"
            />
            <TimelineProgress
              total={timelineItemsCount}
              current={currentIndex}
              className="my-20 w-2 flex-auto 2xl:my-24 2xl:w-3"
            />
            <TimelineOwner iconClassName="2xl:size-8" />
          </div>
        </div>
      </>
      {timelineItems?.map((itemsArray, page) =>
        itemsArray.map((item, index) => {
          const { id, created_at } = item;
          const orderedIndex = page * PAGE_LIMIT + index + 1;

          return (
            <TimelineItem
              key={id}
              id={id}
              item={item}
              className="mb-8"
              data-created-at={created_at}
              data-ordered-index={orderedIndex}
            />
          );
        }),
      )}
      <div className={`my-16 select-none text-center`}>
        {isFullyLoaded ? (
          <div className="text-foreground-dark">
            <Icon path={mdiSlashForwardBox} className="mx-auto mb-1 size-7" />
            <span>没有更多噜</span>
          </div>
        ) : (
          <button
            ref={loadMoreButtonRef}
            className={`rounded border-2 bg-background-light px-3 py-2 transition hover:bg-background-lighter ${isValidatingTimelineItems ? "!bg-disabled" : ""}`}
            onClick={() => setQueryTimelineItemsPage((prev) => prev + 1)}
            disabled={isValidatingTimelineItems}
          >
            {isValidatingTimelineItems ? (
              <Icon path={mdiLoading} size={1} className="animate-spin" />
            ) : (
              "加载更多"
            )}
          </button>
        )}
      </div>
    </div>
  );
}
