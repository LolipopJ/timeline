"use client";

import {
  mdiArrowUp,
  mdiCogOutline,
  mdiLoading,
  mdiSlashForwardBox,
} from "@mdi/js";
import Icon from "@mdi/react";
import type { TimelineItemClient } from "@timeline/contracts";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { KeyLoader } from "swr";
import useSWR, { SWRConfig } from "swr";
import useSWRInfinite from "swr/infinite";

import AdminConsole from "@/components/AdminConsole";
import TimelineArchive, {
  TimelineArchiveError,
  TimelineArchiveLoading,
} from "@/components/TimelineArchive";
import TimelineCurrentDate from "@/components/TimelineCurrentDate";
import TimelineVirtualList, {
  getTimelineRows,
  type TimelineVirtualListHandle,
} from "@/components/TimelineHome/VirtualList";
import TimelineSearch from "@/components/TimelineSearch";
import TimelineTools from "@/components/TimelineTools";
import GlobalContext from "@/contexts/GlobalContext";
import { fetcherGET } from "@/services/axios";
import { getSearchParamsFromObject } from "@/utils/searchParams";
import {
  areTimelineFiltersEqual,
  getTimelineFilterUrl,
  getTimelineRequestParams,
  parseTimelineSearch,
  type TimelineFilters,
  type TimelineFiltersChange,
} from "@/utils/timelineFilters";

const PAGE_LIMIT = 20;
const EMPTY_PAGES: TimelineItemClient[][] = [[]];
const DATA_CACHE = { provider: () => new Map(), keepPreviousData: false };
const floatingButtonClass =
  "size-12 cursor-pointer place-items-center rounded-full border border-control bg-background-light text-foreground shadow-lg hover:bg-background-lighter active:bg-background-lighter";

export default function TimelineHome() {
  const router = useRouter();
  const pathname = usePathname();
  const urlSearchParams = useSearchParams();
  const { isLoggedIn, view } = useContext(GlobalContext);
  const previewFocusRef = useRef(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const pendingFilters = useRef<
    { key: string; value: TimelineFilters } | undefined
  >(undefined);

  const {
    data: serviceLabels,
    error: servicesError,
    isValidating: isValidatingServices,
    mutate: reloadServices,
  } = useSWR<string[]>(
    `/timeline-services?view=${isLoggedIn && view === "admin" ? "admin" : "public"}`,
    fetcherGET,
    {
      revalidateOnFocus: false,
    },
  );
  const filters = useMemo<TimelineFilters>(
    () => ({
      ...parseTimelineSearch(
        urlSearchParams.get("search") ?? "",
        serviceLabels ?? [],
      ),
      orderBy:
        urlSearchParams.get("orderBy") === "updated_at"
          ? "updated_at"
          : "created_at",
    }),
    [urlSearchParams, serviceLabels],
  );
  const changeFilters = useCallback<TimelineFiltersChange>(
    (update, mode) => {
      const key = urlSearchParams.toString();
      if (new URLSearchParams(window.location.search).toString() !== key)
        return;
      clearTimeout(searchTimer.current);
      const current =
        pendingFilters.current?.key === key
          ? pendingFilters.current.value
          : filters;
      const next = typeof update === "function" ? update(current) : update;
      pendingFilters.current = { key, value: next };
      const commit = () => {
        if (
          new URLSearchParams(window.location.search).toString() !==
          urlSearchParams.toString()
        )
          return;
        pendingFilters.current = undefined;
        if (!areTimelineFiltersEqual(filters, next))
          router.replace(getTimelineFilterUrl(pathname, next), {
            scroll: false,
          });
      };
      if (mode === "draft") return;
      if (mode === "debounce") searchTimer.current = setTimeout(commit, 500);
      else commit();
    },
    [filters, pathname, router, urlSearchParams],
  );
  useEffect(
    () => () => {
      clearTimeout(searchTimer.current);
      pendingFilters.current = undefined;
    },
    [urlSearchParams],
  );

  if (!serviceLabels)
    return (
      <TimelineArchive>
        {servicesError ? (
          <TimelineArchiveError
            error="筛选来源加载失败"
            onRetry={() => void reloadServices()}
            retrying={isValidatingServices}
          />
        ) : (
          <TimelineArchiveLoading label="正在加载筛选来源" />
        )}
      </TimelineArchive>
    );

  return (
    <SWRConfig
      key={`${isLoggedIn ? "admin" : "guest"}:${view}`}
      value={DATA_CACHE}
    >
      <TimelineData
        filters={filters}
        serviceLabels={serviceLabels}
        onFiltersChange={changeFilters}
        searchKey={urlSearchParams.toString()}
        previewFocusRef={previewFocusRef}
      />
    </SWRConfig>
  );
}

function TimelineData({
  filters,
  serviceLabels,
  onFiltersChange,
  searchKey,
  previewFocusRef,
}: {
  filters: TimelineFilters;
  serviceLabels: string[];
  onFiltersChange: TimelineFiltersChange;
  searchKey: string;
  previewFocusRef: React.RefObject<boolean>;
}) {
  const { view, canManageItems } = useContext(GlobalContext);
  const [adminOpen, setAdminOpen] = useState(false);
  const closeAdmin = useCallback(() => setAdminOpen(false), []);
  const timelineRef = useRef<HTMLDivElement>(null);
  const virtualListRef = useRef<TimelineVirtualListHandle>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [readingPosition, setReadingPosition] = useState<{
    query: string;
    month: string;
  }>();

  useEffect(() => {
    const update = () => setShowBackToTop(window.scrollY > window.innerHeight);
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  const query = useMemo(
    () =>
      getSearchParamsFromObject({ ...getTimelineRequestParams(filters), view }),
    [filters, view],
  );
  const orderBy = filters.orderBy;
  const loadMoreButtonRef = useRef<HTMLButtonElement>(null);

  const getTimelineItemsKey = useCallback<NonNullable<KeyLoader>>(
    (pageIndex, previousPageData) => {
      if (previousPageData?.length < PAGE_LIMIT) return null;
      return `/timeline-items?${query}&page=${pageIndex}&limit=${PAGE_LIMIT}`;
    },
    [query],
  );
  const {
    data: timelineItems = EMPTY_PAGES,
    mutate: mutateTimelineItems,
    isLoading: isLoadingTimelineItems,
    isValidating: isValidatingTimelineItems,
    size,
    setSize: setQueryTimelineItemsPage,
    error: queryTimelineItemsError,
  } = useSWRInfinite<TimelineItemClient[]>(getTimelineItemsKey, fetcherGET);
  const isFullyLoaded =
    !queryTimelineItemsError &&
    !isLoadingTimelineItems &&
    !isValidatingTimelineItems &&
    (timelineItems.at(-1)?.length ?? 0) < PAGE_LIMIT;
  const rows = useMemo(
    () => getTimelineRows(timelineItems, orderBy),
    [timelineItems, orderBy],
  );
  const showInitialStatus =
    !rows.length &&
    (isLoadingTimelineItems || Boolean(queryTimelineItemsError));
  const currentMonth =
    (rows.length && readingPosition?.query === query
      ? readingPosition.month
      : undefined) ?? rows[0]?.month;
  const reportReadingMonth = useCallback(
    (month: string) => {
      setReadingPosition((previous) =>
        previous?.query === query && previous.month === month
          ? previous
          : { query, month },
      );
    },
    [query],
  );

  const refreshTimeline = useCallback(() => {
    void mutateTimelineItems();
  }, [mutateTimelineItems]);

  const loadMore = useCallback(() => {
    void setQueryTimelineItemsPage(size + 1);
  }, [setQueryTimelineItemsPage, size]);

  useLayoutEffect(() => {
    window.scrollTo({ top: 0 });
  }, [query]);

  useEffect(() => {
    if (isFullyLoaded || isValidatingTimelineItems || queryTimelineItemsError)
      return;

    const loadMoreButton = loadMoreButtonRef.current;
    if (!loadMoreButton) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      loadMore();
    });
    observer.observe(loadMoreButton);
    return () => observer.disconnect();
  }, [
    isFullyLoaded,
    isValidatingTimelineItems,
    loadMore,
    queryTimelineItemsError,
  ]);

  return (
    <>
      <TimelineArchive
        ref={timelineRef}
        toolbarRef={toolbarRef}
        toolbar={
          <>
            <TimelineCurrentDate
              month={currentMonth}
              isLoading={isLoadingTimelineItems}
            />
            <TimelineSearch
              searchKey={searchKey}
              value={filters}
              serviceLabels={serviceLabels}
              onChange={onFiltersChange}
              className="min-w-0 flex-1"
            />
            <TimelineTools previewFocusRef={previewFocusRef} />
          </>
        }
        footer={
          !showInitialStatus && (
            <div className="my-12 text-center select-none">
              {queryTimelineItemsError && (
                <p role="alert" className="mb-3 text-danger">
                  时间线加载失败
                </p>
              )}
              {isFullyLoaded && !rows.length ? (
                <p role="status" className="text-foreground-dark">
                  没有找到相关内容
                </p>
              ) : isFullyLoaded ? (
                <div className="text-foreground-dark">
                  <Icon
                    path={mdiSlashForwardBox}
                    className="mx-auto mb-1 size-7"
                  />
                  <span>没有更多噜</span>
                </div>
              ) : (
                <button
                  ref={loadMoreButtonRef}
                  type="button"
                  className="cursor-pointer rounded-md border border-control bg-background-light px-3 py-2 hover:bg-background-lighter disabled:cursor-default disabled:opacity-70"
                  onClick={() => {
                    if (queryTimelineItemsError) refreshTimeline();
                    else loadMore();
                  }}
                  disabled={isValidatingTimelineItems}
                >
                  {isValidatingTimelineItems ? (
                    <Icon
                      path={mdiLoading}
                      size={1}
                      aria-label="正在加载时间线"
                      className="motion-safe:animate-spin"
                    />
                  ) : queryTimelineItemsError ? (
                    "重试加载"
                  ) : (
                    "加载更多"
                  )}
                </button>
              )}
            </div>
          )
        }
      >
        {showInitialStatus ? (
          queryTimelineItemsError ? (
            <TimelineArchiveError
              error="时间线加载失败"
              onRetry={refreshTimeline}
              retrying={isValidatingTimelineItems}
            />
          ) : (
            <TimelineArchiveLoading label="正在加载时间线" />
          )
        ) : rows.length ? (
          <TimelineVirtualList
            key={query}
            ref={virtualListRef}
            rows={rows}
            toolbarRef={toolbarRef}
            onReadingMonthChange={reportReadingMonth}
            filters={filters}
            onFiltersChange={onFiltersChange}
            mutateTimelineItems={mutateTimelineItems}
          />
        ) : null}
      </TimelineArchive>
      <div className="fixed right-[calc(1rem+env(safe-area-inset-right))] bottom-[calc(1rem+env(safe-area-inset-bottom))] z-20 flex flex-col gap-3 lg:bottom-10">
        <button
          type="button"
          aria-label="回到顶部"
          title="回到顶部"
          data-open={showBackToTop}
          inert={!showBackToTop}
          className={`${floatingButtonClass} motion-safe:archive-disclosure ${showBackToTop ? "grid" : "hidden"}`}
          onClick={() => {
            timelineRef.current?.focus({ preventScroll: true });
            const reduceMotion = window.matchMedia(
              "(prefers-reduced-motion: reduce)",
            ).matches;
            virtualListRef.current?.scrollToTop(
              reduceMotion ? "auto" : "smooth",
            );
          }}
        >
          <Icon path={mdiArrowUp} size={1} aria-hidden="true" />
        </button>
        {canManageItems && (
          <button
            type="button"
            aria-label="管理面板"
            title="管理面板"
            aria-haspopup="dialog"
            aria-controls="admin-console"
            aria-expanded={adminOpen}
            className={`${floatingButtonClass} grid motion-safe:transition-colors`}
            onClick={(event) => {
              event.currentTarget.focus({ preventScroll: true });
              setAdminOpen(true);
            }}
          >
            <Icon path={mdiCogOutline} size={1} aria-hidden="true" />
          </button>
        )}
      </div>
      {canManageItems && (
        <AdminConsole
          open={adminOpen}
          onClose={closeAdmin}
          onSyncCompleted={refreshTimeline}
        />
      )}
    </>
  );
}
