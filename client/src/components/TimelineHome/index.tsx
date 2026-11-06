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
import TimelineItem from "@/components/TimelineItem";
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
const archiveTickClass =
  "relative before:absolute before:top-1/2 before:-left-(--archive-gutter) before:-translate-1/2";
const floatingButtonClass =
  "size-12 cursor-pointer place-items-center rounded-full border border-control bg-background-light text-foreground shadow-lg hover:bg-background-lighter active:bg-background-lighter";

function groupByMonth(
  pages: TimelineItemClient[][],
  orderBy: "created_at" | "updated_at",
) {
  const years: {
    year: number;
    months: { key: string; number: string; items: TimelineItemClient[] }[];
  }[] = [];
  for (const page of pages) {
    for (const item of page) {
      const date = new Date(item[orderBy]);
      const year = date.getFullYear();
      const number = String(date.getMonth() + 1).padStart(2, "0");
      const key = `${year}-${number}`;
      let chapter = years.at(-1);
      if (chapter?.year !== year) {
        chapter = { year, months: [] };
        years.push(chapter);
      }
      let month = chapter.months.at(-1);
      if (month?.key !== key) {
        month = { key, number, items: [] };
        chapter.months.push(month);
      }
      month.items.push(item);
    }
  }
  return years;
}

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
  const toolbarRef = useRef<HTMLDivElement>(null);
  const archiveRef = useRef<HTMLDivElement>(null);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [readingMonth, setReadingMonth] = useState<string>();

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

  const queryParams = useMemo(
    () => getTimelineRequestParams(filters),
    [filters],
  );
  const orderBy = filters.orderBy;
  const loadMoreButtonRef = useRef<HTMLButtonElement>(null);

  const getTimelineItemsKey = useCallback<NonNullable<KeyLoader>>(
    (pageIndex, previousPageData) => {
      if (previousPageData?.length < PAGE_LIMIT) return null;
      return `/timeline-items?${getSearchParamsFromObject({
        ...queryParams,
        view,
        page: pageIndex,
        limit: PAGE_LIMIT,
      })}`;
    },
    [queryParams, view],
  );
  const {
    data: timelineItems = EMPTY_PAGES,
    mutate: mutateTimelineItems,
    isLoading: isLoadingTimelineItems,
    isValidating: isValidatingTimelineItems,
    setSize: setQueryTimelineItemsPage,
    error: queryTimelineItemsError,
  } = useSWRInfinite<TimelineItemClient[]>(getTimelineItemsKey, fetcherGET);
  const isFullyLoaded =
    !queryTimelineItemsError &&
    !isLoadingTimelineItems &&
    !isValidatingTimelineItems &&
    (timelineItems.at(-1)?.length ?? 0) < PAGE_LIMIT;
  const years = useMemo(
    () => groupByMonth(timelineItems, orderBy),
    [timelineItems, orderBy],
  );
  const showInitialStatus =
    !years.length &&
    (isLoadingTimelineItems || Boolean(queryTimelineItemsError));
  const currentMonth = years.some(({ months }) =>
    months.some(({ key }) => key === readingMonth),
  )
    ? readingMonth
    : years[0]?.months[0].key;

  const refreshTimeline = useCallback(() => {
    void mutateTimelineItems();
  }, [mutateTimelineItems]);

  useEffect(() => {
    if (isLoadingTimelineItems) {
      window.scrollTo({ top: 0 });
    }
  }, [isLoadingTimelineItems]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [queryParams]);

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
    const toolbar = toolbarRef.current;
    const archive = archiveRef.current;
    if (!toolbar || !archive || !years.length) return;

    const starts = Array.from(
      archive.querySelectorAll<HTMLElement>("[data-month-start]"),
    );
    let frame = 0;
    const update = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const { scrollHeight, scrollTop, clientHeight } =
          document.documentElement;
        const atEnd =
          scrollHeight > clientHeight &&
          scrollHeight - scrollTop - clientHeight <= 1;
        const readingLine = toolbar.getBoundingClientRect().bottom + 12;
        // The last month may be too short to reach the reading line.
        const entry = atEnd
          ? starts.at(-1)
          : starts.findLast(
              (start) => start.getBoundingClientRect().top <= readingLine,
            );
        setReadingMonth((entry ?? starts[0])?.dataset.monthStart);
      });
    };
    const resize = new ResizeObserver(update);
    resize.observe(toolbar);
    resize.observe(archive);
    archive
      .querySelectorAll("[data-archive-month]")
      .forEach((month) => resize.observe(month));
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    update();
    return () => {
      resize.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [years]);

  return (
    <>
      <TimelineArchive
        ref={timelineRef}
        toolbarRef={toolbarRef}
        archiveRef={archiveRef}
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
              {isFullyLoaded && !years.length ? (
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
                    else void setQueryTimelineItemsPage((prev) => prev + 1);
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
        ) : (
          years.map(({ year, months }) => (
            <section
              key={year}
              aria-labelledby={`archive-${year}`}
              className="not-first:mt-12"
            >
              <h2
                id={`archive-${year}`}
                className={`${archiveTickClass} border-b border-binding pb-2 text-4xl font-semibold tracking-tight tabular-nums before:size-2.5 before:rotate-45 before:bg-foreground-dark sm:text-5xl`}
              >
                {year}
              </h2>
              {months.map(({ key, number, items }) => (
                <section
                  key={key}
                  aria-labelledby={`archive-${key}`}
                  data-archive-month
                >
                  <h3
                    id={`archive-${key}`}
                    className={`${archiveTickClass} mt-5 mb-3 text-base font-semibold text-foreground-dark tabular-nums before:h-px before:w-2 before:bg-control lg:text-lg`}
                  >
                    {number} 月
                  </h3>
                  {items.map((item, index) => (
                    <TimelineItem
                      key={item.id}
                      id={item.id}
                      item={item}
                      displayedDateTime={orderBy}
                      mutateTimelineItems={mutateTimelineItems}
                      filters={filters}
                      onFiltersChange={onFiltersChange}
                      data-month-start={index === 0 ? key : undefined}
                    />
                  ))}
                </section>
              ))}
            </section>
          ))
        )}
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
            window.scrollTo({
              top: 0,
              behavior: reduceMotion ? "instant" : "smooth",
            });
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
