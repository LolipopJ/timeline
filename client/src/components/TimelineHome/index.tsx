"use client";

import {
  mdiArrowUp,
  mdiCogOutline,
  mdiLoading,
  mdiSlashForwardBox,
} from "@mdi/js";
import Icon from "@mdi/react";
import type {
  GetTimelineItemsParams,
  TimelineItemClient,
} from "@timeline/contracts";
import { SyncServiceType } from "@timeline/contracts";
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
import { SWRConfig } from "swr";
import useSWRInfinite from "swr/infinite";

import AdminConsole from "@/components/AdminConsole";
import ThemeToggle from "@/components/ThemeToggle";
import TimelineCurrentDate from "@/components/TimelineCurrentDate";
import TimelineItem from "@/components/TimelineItem";
import TimelineOwner from "@/components/TimelineOwner";
import TimelineSearch, {
  type TimelineSearchProps,
} from "@/components/TimelineSearch";
import GlobalContext from "@/contexts/GlobalContext";
import useDebounce from "@/hooks/useDebounce";
import { fetcherGET } from "@/services/axios";
import { getSearchParamsFromObject } from "@/utils/searchParams";

const PAGE_LIMIT = 20;
const EMPTY_PAGES: TimelineItemClient[][] = [[]];
const DATA_CACHE = { provider: () => new Map(), keepPreviousData: false };
const archiveTickClass =
  "relative before:absolute before:top-1/2 before:-left-(--archive-gutter) before:-translate-1/2";
const floatingButtonClass =
  "grid size-12 cursor-pointer place-items-center rounded-full border border-control bg-background-light text-foreground shadow-lg motion-safe:transition-colors hover:bg-background-lighter active:bg-background-lighter";

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

  const [searchParamsState, setSearchParamsState] =
    useState<GetTimelineItemsParams>({
      search: urlSearchParams.get("search") ?? "",
      orderBy:
        urlSearchParams.get("orderBy") === "updated_at"
          ? "updated_at"
          : "created_at",
      serviceId: urlSearchParams.get("serviceId") ?? undefined,
      serviceType: Object.values(SyncServiceType).find(
        (type) => type === urlSearchParams.get("serviceType"),
      ),
    });
  const debouncedSearchParams = useDebounce(searchParamsState, 500);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const params = new URLSearchParams();
    if (debouncedSearchParams.search)
      params.set("search", debouncedSearchParams.search);
    if (debouncedSearchParams.serviceId)
      params.set("serviceId", debouncedSearchParams.serviceId);
    if (debouncedSearchParams.serviceType)
      params.set("serviceType", debouncedSearchParams.serviceType);
    if (
      debouncedSearchParams.orderBy &&
      debouncedSearchParams.orderBy !== "created_at"
    )
      params.set("orderBy", debouncedSearchParams.orderBy);
    const queryString = params.toString();
    const newUrl = queryString ? `${pathname}?${queryString}` : pathname;
    const currentQueryString = urlSearchParams.toString();
    const currentUrl = currentQueryString
      ? `${pathname}?${currentQueryString}`
      : pathname;
    if (newUrl !== currentUrl) router.replace(newUrl, { scroll: false });
  }, [debouncedSearchParams, pathname, router, urlSearchParams]);

  return (
    <SWRConfig
      key={`${isLoggedIn ? "admin" : "guest"}:${view}`}
      value={DATA_CACHE}
    >
      <TimelineData
        searchParamsState={searchParamsState}
        setSearchParamsState={setSearchParamsState}
        debouncedSearchParams={debouncedSearchParams}
      />
    </SWRConfig>
  );
}

function TimelineData({
  searchParamsState,
  setSearchParamsState,
  debouncedSearchParams,
}: {
  searchParamsState: GetTimelineItemsParams;
  setSearchParamsState: React.Dispatch<
    React.SetStateAction<GetTimelineItemsParams>
  >;
  debouncedSearchParams: GetTimelineItemsParams;
}) {
  const { isLoggedIn, view, setView, canManageItems, logout, isLoggingOut } =
    useContext(GlobalContext);
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

  const orderBy = debouncedSearchParams.orderBy ?? "created_at";
  const loadMoreButtonRef = useRef<HTMLButtonElement>(null);

  const getTimelineItemsKey = useCallback<NonNullable<KeyLoader>>(
    (pageIndex, previousPageData) => {
      if (previousPageData?.length < PAGE_LIMIT) return null;
      return `/timeline-items?${getSearchParamsFromObject({
        ...debouncedSearchParams,
        view,
        page: pageIndex,
        limit: PAGE_LIMIT,
      })}`;
    },
    [debouncedSearchParams, view],
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

  const timelineSearchProps: TimelineSearchProps = {
    value: searchParamsState,
    onChange: setSearchParamsState,
    onClear: () => setSearchParamsState((prev) => ({ ...prev, search: "" })),
  };

  return (
    <div
      ref={timelineRef}
      tabIndex={-1}
      className="mx-auto max-w-6xl outline-none lg:grid lg:grid-cols-[11rem_minmax(0,1fr)] lg:gap-10 lg:px-8 lg:[--timeline-bottom:2.5rem]"
    >
      <aside
        aria-label="时间线工具"
        className="sticky top-0 z-20 flex min-h-17 items-center gap-2 border-b border-binding bg-background-light px-3 pt-[max(.5rem,env(safe-area-inset-top))] pb-2 sm:gap-3 sm:px-6 lg:top-8 lg:mt-8 lg:h-[calc(100dvh-2rem-var(--timeline-bottom))] lg:min-h-68 lg:flex-col lg:items-stretch lg:gap-5 lg:self-start lg:border-b-0 lg:bg-background lg:px-0 lg:pt-2 lg:pb-0"
      >
        <div
          ref={toolbarRef}
          className="flex min-w-0 flex-1 items-center gap-2 self-stretch sm:gap-3 lg:flex-none lg:flex-col lg:items-stretch lg:gap-5"
        >
          <TimelineCurrentDate month={currentMonth} />
          <TimelineSearch {...timelineSearchProps} className="min-w-0 flex-1" />
          <ThemeToggle />
        </div>
        <div className="lg:mt-auto">
          <TimelineOwner />
        </div>
      </aside>
      <div className="min-w-0 px-4 pt-6 pb-12 sm:px-6 lg:px-0 lg:pt-8">
        {isLoggedIn && view === "public" && (
          <section
            aria-label="访客预览"
            className="mb-6 rounded-lg border border-primary/50 bg-background-light p-4"
          >
            <h2 className="font-bold text-primary">访客预览</h2>
            <p className="mt-1 text-sm text-foreground-dark">
              当前仅显示公开内容，管理员登录仍然有效。
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setView("admin")}
                className="min-h-11 cursor-pointer rounded-md bg-primary px-4 py-2 text-on-primary"
              >
                返回管理员视角
              </button>
              <button
                type="button"
                onClick={() => void logout()}
                disabled={isLoggingOut}
                className="min-h-11 cursor-pointer rounded-md border border-control bg-background-lighter px-4 py-2 disabled:opacity-50"
              >
                {isLoggingOut ? "正在退出…" : "退出登录"}
              </button>
            </div>
          </section>
        )}
        <div
          ref={archiveRef}
          className="ml-1 border-l border-binding pl-(--archive-gutter) [--archive-gutter:1.125rem] lg:ml-24 lg:[--archive-gutter:1.75rem]"
        >
          {years.map(({ year, months }) => (
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
                    className={`${archiveTickClass} mt-5 mb-3 text-sm font-semibold text-foreground-dark tabular-nums before:h-px before:w-2 before:bg-control`}
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
                      data-month-start={index === 0 ? key : undefined}
                    />
                  ))}
                </section>
              ))}
            </section>
          ))}
        </div>
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
              <Icon path={mdiSlashForwardBox} className="mx-auto mb-1 size-7" />
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
      </div>
      {(showBackToTop || canManageItems) && (
        <div className="fixed right-[calc(1rem+env(safe-area-inset-right))] bottom-[calc(1rem+env(safe-area-inset-bottom))] z-20 flex flex-col gap-3 lg:bottom-(--timeline-bottom)">
          {showBackToTop && (
            <button
              type="button"
              aria-label="回到顶部"
              title="回到顶部"
              className={`${floatingButtonClass}`}
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
          )}
          {canManageItems && (
            <button
              type="button"
              aria-label="管理面板"
              title="管理面板"
              aria-haspopup="dialog"
              aria-controls="admin-console"
              aria-expanded={adminOpen}
              className={`${floatingButtonClass}`}
              onClick={(event) => {
                event.currentTarget.focus({ preventScroll: true });
                setAdminOpen(true);
              }}
            >
              <Icon path={mdiCogOutline} size={1} aria-hidden="true" />
            </button>
          )}
        </div>
      )}
      {canManageItems && (
        <AdminConsole
          open={adminOpen}
          onClose={closeAdmin}
          onSyncCompleted={refreshTimeline}
        />
      )}
    </div>
  );
}
