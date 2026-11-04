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
import useSWR, { SWRConfig } from "swr";
import useSWRInfinite from "swr/infinite";

import AdminConsole from "@/components/AdminConsole";
import message from "@/components/Message";
import { TimelineCurrentDate } from "@/components/TimelineCurrentDate";
import TimelineItem from "@/components/TimelineItem";
import TimelineOwner from "@/components/TimelineOwner";
import TimelineProgress from "@/components/TimelineProgress";
import TimelineSearch, {
  type TimelineSearchProps,
} from "@/components/TimelineSearch";
import GlobalContext from "@/contexts/GlobalContext";
import useDebounce from "@/hooks/useDebounce";
import { fetcherGET } from "@/services/axios";
import { getSearchParamsFromObject } from "@/utils/searchParams";

const PAGE_LIMIT = 20;
const DATA_CACHE = { provider: () => new Map(), keepPreviousData: false };
const floatingButtonClass =
  "grid size-12 cursor-pointer place-items-center rounded-full border shadow-lg motion-safe:transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary border-foreground-dark/30 bg-background-light text-foreground hover:bg-background-lighter active:bg-background-lighter";

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
  const [showBackToTop, setShowBackToTop] = useState(false);

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

  const orderBy = searchParamsState.orderBy;
  const orderByRef = useRef(orderBy);
  useEffect(() => {
    orderByRef.current = orderBy;
  }, [orderBy]);

  const [currenDate, setCurrentDate] = useState<Date>(new Date());
  const [currentIndex, setCurrentIndex] = useState<number>(0);

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
          orderBy === "updated_at" ? item.updated_at : item.created_at,
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
  }, [timelineItems, orderBy]);

  const getTimelineItemsCountKey = useMemo(() => {
    return `/timeline-items/count?${getSearchParamsFromObject({ ...debouncedSearchParams, view })}`;
  }, [debouncedSearchParams, view]);
  const { data: timelineItemsCount = Infinity, mutate: mutateTimelineCount } =
    useSWR<number>(getTimelineItemsCountKey, fetcherGET);

  const refreshTimeline = useCallback(() => {
    void Promise.all([mutateTimelineItems(), mutateTimelineCount()]);
  }, [mutateTimelineItems, mutateTimelineCount]);

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
    <div
      ref={timelineRef}
      tabIndex={-1}
      className="mt-20 max-w-(--breakpoint-md) px-4 py-6 outline-none sm:px-6 sm:py-8 md:mx-auto md:mt-24 md:px-8 md:py-10 lg:mt-0"
    >
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
            <TimelineSearch {...timelineSearchProps} className="mt-6 -ml-1.5" />
            <TimelineProgress
              total={timelineItemsCount}
              current={currentIndex}
              className="my-20 w-2 flex-auto 2xl:my-24 2xl:w-3"
            />
            <TimelineOwner />
          </div>
        </div>
      </>
      {isLoggedIn && view === "public" && (
        <section
          aria-label="访客预览"
          className="mb-6 rounded-lg border border-primary/50 bg-background-light p-4"
        >
          <h1 className="font-bold text-primary-light">访客预览</h1>
          <p className="mt-1 text-sm text-foreground-dark">
            当前仅显示公开内容，管理员登录仍然有效。
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setView("admin")}
              className="min-h-11 cursor-pointer rounded-md bg-primary-dark px-4 py-2 focus-visible:outline-2 focus-visible:outline-primary"
            >
              返回管理员视角
            </button>
            <button
              type="button"
              onClick={() => void logout()}
              disabled={isLoggingOut}
              className="min-h-11 cursor-pointer rounded-md bg-background-lighter px-4 py-2 focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50"
            >
              {isLoggingOut ? "正在退出…" : "退出登录"}
            </button>
          </div>
        </section>
      )}
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
                displayedDateTime={orderBy}
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
                className="my-4 flex items-center justify-end select-none md:my-6 lg:my-12"
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
      <div className={`my-16 text-center select-none`}>
        {isFullyLoaded ? (
          <div className="text-foreground-dark">
            <Icon path={mdiSlashForwardBox} className="mx-auto mb-1 size-7" />
            <span>没有更多噜</span>
          </div>
        ) : (
          <button
            ref={loadMoreButtonRef}
            className={`cursor-pointer rounded-sm border-2 border-[#e5e7eb] bg-background-light px-3 py-2 transition hover:bg-background-lighter disabled:cursor-default ${isValidatingTimelineItems ? "bg-disabled!" : ""}`}
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
      {(showBackToTop || canManageItems) && (
        <div className="fixed right-[calc(1rem+env(safe-area-inset-right))] bottom-[calc(1rem+env(safe-area-inset-bottom))] z-20 flex flex-col gap-3">
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
