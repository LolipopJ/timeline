"use client";

import { mdiLoading, mdiSlashForwardBox } from "@mdi/js";
import Icon from "@mdi/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
  const router = useRouter();
  const pathname = usePathname();
  const urlSearchParams = useSearchParams();

  const [searchParamsState, setSearchParamsState] =
    useState<GetTimelineItemsParams>({
      search: urlSearchParams.get("search") ?? "",
      orderBy:
        (urlSearchParams.get("orderBy") as "created_at" | "updated_at") ??
        "created_at",
    });
  const orderByRef = useRef(searchParamsState.orderBy);
  useEffect(() => {
    orderByRef.current = searchParamsState.orderBy;
  }, [searchParamsState.orderBy]);

  const debouncedSearchParams = useDebounce(searchParamsState, 500);

  const [currenDate, setCurrentDate] = useState<Date>(new Date());
  const [currentIndex, setCurrentIndex] = useState<number>(0);

  const loadMoreButtonRef = useRef<HTMLButtonElement>(null);
  const isFirstRender = useRef(true);

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
    data: timelineItems = [[]],
    mutate: mutateTimelineItems,
    isLoading: isLoadingTimelineItems,
    isValidating: isValidatingTimelineItems,
    setSize: setQueryTimelineItemsPage,
    error: queryTimelineItemsError,
  } = useSWRInfinite<TimelineItemClient[]>(getTimelineItemsKey, fetcherGET);
  const isFullyLoaded =
    !isLoadingTimelineItems &&
    !isValidatingTimelineItems &&
    timelineItems &&
    timelineItems[timelineItems.length - 1].length < PAGE_LIMIT;
  const flatTimelineItems = useMemo(() => {
    const items: (
      ({ type: "item" } & TimelineItemClient) | { type: "year"; year: number }
    )[] = [];

    let previousYear = new Date().getFullYear();
    timelineItems.forEach((itemsArray) => {
      itemsArray.forEach((item) => {
        const currentDate = new Date(
          orderByRef.current === "updated_at"
            ? item.updated_at
            : item.created_at,
        );
        const currentYear = currentDate.getFullYear();
        if (previousYear !== currentYear) {
          previousYear = currentYear;
          items.push({ type: "year", year: currentYear });
        }
        items.push({ type: "item", ...item });
      });
    });

    return items;
  }, [timelineItems]);

  const getTimelineItemsCountKey = useMemo(() => {
    return `/timeline-items/count?${getSearchParamsFromObject(debouncedSearchParams)}`;
  }, [debouncedSearchParams]);
  const { data: timelineItemsCount = Infinity } = useSWR<number>(
    getTimelineItemsCountKey,
    fetcherGET,
  );

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    const params = new URLSearchParams();
    if (debouncedSearchParams.search) {
      params.set("search", debouncedSearchParams.search);
    }
    if (
      debouncedSearchParams.orderBy &&
      debouncedSearchParams.orderBy !== "created_at"
    ) {
      params.set("orderBy", debouncedSearchParams.orderBy);
    }

    const queryString = params.toString();
    const newUrl = queryString ? `${pathname}?${queryString}` : pathname;
    const currentQueryString = urlSearchParams.toString();
    const currentUrl = currentQueryString
      ? `${pathname}?${currentQueryString}`
      : pathname;

    if (newUrl !== currentUrl) {
      router.replace(newUrl, { scroll: false });
    }
  }, [debouncedSearchParams, pathname, router, urlSearchParams]);

  useEffect(() => {
    if (isLoadingTimelineItems) {
      window.scrollTo({ top: 0 });
    }
  }, [isLoadingTimelineItems]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [debouncedSearchParams]);

  useEffect(() => {
    if (isFullyLoaded || isValidatingTimelineItems || queryTimelineItemsError)
      return;

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
  }, [
    isFullyLoaded,
    isValidatingTimelineItems,
    queryTimelineItemsError,
    setQueryTimelineItemsPage,
  ]);

  useEffect(() => {
    if (isValidatingTimelineItems) return;

    const timelineItemDOMs = document.querySelectorAll(".timeline-item");
    if (!timelineItemDOMs.length) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;

        const field = orderByRef.current;
        const attrName =
          field === "updated_at" ? "data-updated-at" : "data-created-at";
        const dateStr = entry.target.getAttribute(attrName);

        if (dateStr) {
          setCurrentDate(new Date(dateStr));
        }

        const orderedIndex = entry.target.getAttribute("data-ordered-index");
        if (orderedIndex) {
          setCurrentIndex(Number(orderedIndex));
        }
      },
      { threshold: 0 },
    );

    timelineItemDOMs.forEach((dom) => observer.observe(dom));
    return () => observer.disconnect();
  }, [isValidatingTimelineItems]);

  useEffect(() => {
    if (!isLoadingTimelineItems && timelineItems[0].length === 0) {
      message.info("嘟嘟噜，时间线上没有找到相关内容喔~");
    }
  }, [isLoadingTimelineItems, timelineItems]);

  const timelineSearchProps: TimelineSearchProps = {
    value: searchParamsState,
    onChange: setSearchParamsState,
    onClear: () => setSearchParamsState((prev) => ({ ...prev, search: "" })),
  };

  return (
    <div className="mt-20 max-w-screen-md px-4 py-6 sm:px-6 sm:py-8 md:mx-auto md:mt-24 md:px-8 md:py-10 lg:mt-0">
      <>
        <div className="lg:hidden">
          <div
            className={`fixed inset-x-0 top-0 z-20 flex h-20 items-center bg-background-light px-4 shadow-md shadow-background-lighter sm:px-6 md:h-24 md:px-8`}
          >
            <TimelineCurrentDate date={currenDate} className="min-w-28" />
            <TimelineSearch
              {...timelineSearchProps}
              className="ml-auto w-48 sm:w-52 md:w-60"
            />
            <TimelineOwner
              className="ml-12 hidden sm:flex"
              iconClassName="text-foreground"
            />
          </div>
        </div>
        <div className="hidden lg:block">
          <div
            className={`fixed -mt-10 flex h-screen w-40 -translate-x-full flex-col py-10 pr-10 2xl:w-48 2xl:pr-12`}
          >
            <TimelineCurrentDate date={currenDate} />
            <TimelineSearch {...timelineSearchProps} className="-ml-1.5 mt-6" />
            <TimelineProgress
              total={timelineItemsCount}
              current={currentIndex}
              className="my-20 w-2 flex-auto 2xl:my-24 2xl:w-3"
            />
            <TimelineOwner />
          </div>
        </div>
      </>
      <div
        className={`transition-opacity ${isLoadingTimelineItems ? "opacity-75" : "opacity-100"}`}
      >
        {flatTimelineItems.map((item, index) => {
          if (item.type === "item") {
            const { id, created_at, updated_at } = item;
            const orderedIndex = index + 1;

            return (
              <TimelineItem
                key={`item-${id}}`}
                id={id}
                item={item}
                displayedDateTime={orderByRef.current}
                mutateTimelineItems={mutateTimelineItems}
                className="mb-8"
                data-created-at={created_at}
                data-updated-at={updated_at}
                data-ordered-index={orderedIndex}
              />
            );
          } else if (item.type === "year") {
            const { year } = item;
            return (
              <div
                key={`year-${year}`}
                className="my-4 flex select-none items-center justify-end md:my-6 lg:my-12"
              >
                <span className="text-4xl font-black tracking-tighter sm:text-5xl md:text-6xl lg:text-7xl">
                  {year}
                </span>
              </div>
            );
          } else {
            return null;
          }
        })}
      </div>
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
