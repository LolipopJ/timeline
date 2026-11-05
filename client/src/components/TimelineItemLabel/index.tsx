import {
  mdiBookmarkMultiple,
  mdiCommentProcessing,
  mdiCommentText,
  mdiEyeOffOutline,
  mdiEyeOutline,
  mdiFilterOutline,
  mdiLinkVariant,
  mdiOpenInNew,
  mdiRssBox,
  mdiStarShooting,
  mdiSteam,
  mdiTrashCanOutline,
  mdiVideoVintage,
} from "@mdi/js";
import Icon from "@mdi/react";
import type {
  GetTimelineItemsParams,
  TimelineItemClient,
} from "@timeline/contracts";
import { SyncServiceType } from "@timeline/contracts";
import { useContext, useEffect, useRef, useState } from "react";
import type { SWRInfiniteKeyedMutator } from "swr/infinite";

import message from "@/components/Message";
import GlobalContext from "@/contexts/GlobalContext";
import { fetcherDELETE, fetcherPATCH } from "@/services/axios";
import {
  getTimelineFilterUrl,
  type TimelineFilters,
  type TimelineFiltersChange,
} from "@/utils/timelineFilters";

export interface TimelineItemLabelProps {
  item: TimelineItemClient;
  mutateTimelineItems: SWRInfiniteKeyedMutator<TimelineItemClient[][]>;
  displayedDateTime?: GetTimelineItemsParams["orderBy"];
  className?: string;
  filters: TimelineFilters;
  onFiltersChange: TimelineFiltersChange;
}

const LABEL_ICON_PATH: Partial<Record<SyncServiceType, string>> = {
  [SyncServiceType.BILIBILI_COLLECTION]: mdiBookmarkMultiple,
  [SyncServiceType.BILIBILI_WORK]: mdiVideoVintage,
  [SyncServiceType.FEED]: mdiRssBox,
  [SyncServiceType.GITHUB_ISSUE_COMMENT]: mdiCommentText,
  [SyncServiceType.QZONE_TALK]: mdiStarShooting,
  [SyncServiceType.STEAM_GAME_REVIEW]: mdiSteam,
};

const LABEL_ICON_COLOR: Partial<Record<SyncServiceType, string>> = {
  [SyncServiceType.BILIBILI_COLLECTION]: "#fb7299",
  [SyncServiceType.BILIBILI_WORK]: "#fb7299",
  [SyncServiceType.FEED]: "#818cf8",
  [SyncServiceType.GITHUB_ISSUE_COMMENT]: "oklch(55.4% 0.046 257.417)",
  [SyncServiceType.QZONE_TALK]: "#cc8f14",
  [SyncServiceType.STEAM_GAME_REVIEW]: "#95a1ae",
};

const twoDigits = (value: number) => String(value).padStart(2, "0");

function formatDateTime(date: Date) {
  return `${twoDigits(date.getMonth() + 1)}/${twoDigits(date.getDate())} ${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}`;
}

export default function TimelineItemLabel(props: TimelineItemLabelProps) {
  const {
    item: {
      id,
      sync_service_id,
      sync_service_type,
      created_at,
      updated_at,
      label,
      url,
      is_secret,
    },
    displayedDateTime = "created_at",
    mutateTimelineItems,
    filters,
    onFiltersChange,
    className = "",
    ...rest
  } = props;
  const { lastVisitDate, canManageItems } = useContext(GlobalContext);

  const [menuOpen, setMenuOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(e: MouseEvent) {
      if (e.target instanceof Node && !menuRef.current?.contains(e.target)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [menuOpen]);

  function closeMenu() {
    setMenuOpen(false);
    menuButtonRef.current?.focus({ preventScroll: true });
  }

  async function shareItem() {
    const next = { orderBy: filters.orderBy, search: "", id };
    const link = new URL(
      getTimelineFilterUrl(window.location.pathname, next),
      window.location.origin,
    ).href;
    try {
      await navigator.clipboard.writeText(link);
      message.success("分享链接已复制");
    } catch {
      message.error("复制失败，请检查剪贴板权限后重试");
    }
  }

  const updateTimelineItemsCache = (
    updater: (data: TimelineItemClient[]) => TimelineItemClient[],
  ) => {
    mutateTimelineItems((pages) => pages?.map((page) => updater(page)), {
      revalidate: false,
    });
  };

  const handleToggleSecret = async () => {
    if (
      submitting ||
      !window.confirm(
        is_secret ? "确认将该时间线项设为公开？" : "确认将该时间线项设为私密？",
      )
    )
      return;

    const nextIsSecret = !is_secret;
    setSubmitting(true);
    try {
      await fetcherPATCH(`/timeline-items/${id}`, {
        is_secret: nextIsSecret,
      });
      message.success(nextIsSecret ? "已设为私密" : "已设为公开");
      updateTimelineItemsCache((items) =>
        items.map((it) =>
          it.id === id ? { ...it, is_secret: nextIsSecret } : it,
        ),
      );
    } catch (error) {
      message.error(String(error));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (submitting || !window.confirm("确认删除该时间线项？")) return;

    setSubmitting(true);
    try {
      await fetcherDELETE(`/timeline-items/${id}`);
      message.success("已删除");
      updateTimelineItemsCache((items) => items.filter((it) => it.id !== id));
    } catch (error) {
      message.error(String(error));
    } finally {
      setSubmitting(false);
    }
  };

  const createdAt = new Date(created_at);
  const createdAtString = createdAt.toLocaleString();
  const updatedAt = new Date(updated_at);
  const updatedAtString = updatedAt.toLocaleString();
  const hasUpdated = updatedAt.getTime() !== createdAt.getTime();

  const displayedDate =
    displayedDateTime === "updated_at" ? updatedAt : createdAt;

  const isNewlyCreated = lastVisitDate && lastVisitDate < createdAt;
  const isNewlyUpdated = lastVisitDate && lastVisitDate < updatedAt;

  const sourceIconColor = LABEL_ICON_COLOR[sync_service_type];
  const source = (
    <>
      <Icon
        path={LABEL_ICON_PATH[sync_service_type] ?? mdiCommentProcessing}
        className="size-4 shrink-0"
        style={
          sourceIconColor
            ? {
                color: `color-mix(in srgb, ${sourceIconColor} 60%, var(--foreground))`,
              }
            : undefined
        }
        aria-hidden="true"
      />
      <span className="wrap-anywhere">{label || sync_service_id}</span>
    </>
  );

  return (
    <div
      className={`flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 pb-2 text-sm ${className}`}
      {...rest}
    >
      <time
        className="font-mono text-xs whitespace-nowrap text-foreground-dark tabular-nums lg:absolute lg:top-4 lg:right-[calc(100%+var(--archive-gutter)+0.75rem)] lg:-translate-y-1/2"
        dateTime={displayedDateTime === "updated_at" ? updated_at : created_at}
        title={
          `创建于：${createdAtString}` +
          (hasUpdated ? `\n最后更新于：${updatedAtString}` : "")
        }
      >
        {formatDateTime(displayedDate)}
      </time>
      <div
        ref={menuRef}
        className="relative max-w-full min-w-0"
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget))
            setMenuOpen(false);
        }}
        onKeyDown={(event) => {
          if (menuOpen && event.key === "Escape") {
            event.stopPropagation();
            closeMenu();
          }
        }}
      >
        <button
          ref={menuButtonRef}
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          className="flex min-h-8 cursor-pointer items-center gap-1.5 rounded-sm font-medium hover:text-primary"
        >
          {source}
        </button>
        {menuOpen && (
          <div className="absolute top-full left-0 z-10 w-max rounded-md border border-control bg-background-light text-sm font-normal shadow-lg">
            <ul className="p-1">
              {url ? (
                <li>
                  <a
                    href={url ?? undefined}
                    target="_blank"
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left whitespace-nowrap text-foreground hover:bg-background-lighter"
                  >
                    <Icon path={mdiOpenInNew} size={0.7} />
                    打开链接
                  </a>
                </li>
              ) : null}
              <li>
                <button
                  type="button"
                  onClick={() => {
                    closeMenu();
                    void shareItem();
                  }}
                  className="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left whitespace-nowrap text-foreground hover:bg-background-lighter"
                >
                  <Icon path={mdiLinkVariant} size={0.7} aria-hidden="true" />
                  复制分享链接
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => {
                    closeMenu();
                    onFiltersChange((current) => ({
                      ...current,
                      id: undefined,
                      serviceId: sync_service_id,
                    }));
                  }}
                  className="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left whitespace-nowrap text-foreground hover:bg-background-lighter"
                >
                  <Icon path={mdiFilterOutline} size={0.7} aria-hidden="true" />
                  只看当前类型
                </button>
              </li>
              {canManageItems ? (
                <>
                  <li>
                    <button
                      type="button"
                      onClick={() => {
                        closeMenu();
                        handleToggleSecret();
                      }}
                      className="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left whitespace-nowrap text-foreground hover:bg-background-lighter"
                    >
                      <Icon
                        path={is_secret ? mdiEyeOutline : mdiEyeOffOutline}
                        size={0.7}
                      />
                      {is_secret ? "设为公开" : "设为私密"}
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      onClick={() => {
                        closeMenu();
                        handleDelete();
                      }}
                      className="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left whitespace-nowrap text-danger hover:bg-background-lighter"
                    >
                      <Icon path={mdiTrashCanOutline} size={0.7} />
                      删除
                    </button>
                  </li>
                </>
              ) : null}
            </ul>
          </div>
        )}
      </div>
      {is_secret && (
        <span className="rounded-sm bg-background-lighter px-1.5 text-xs text-warning">
          私密
        </span>
      )}
      {(isNewlyCreated || isNewlyUpdated) && (
        <span className="rounded-sm bg-background-lighter px-1.5 text-xs text-primary">
          {isNewlyCreated ? "新增" : "已更新"}
        </span>
      )}
    </div>
  );
}
