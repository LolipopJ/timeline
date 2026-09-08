import {
  mdiBookmarkMultiple,
  mdiClockTimeFour,
  mdiClockTimeSeven,
  mdiCommentProcessing,
  mdiCommentText,
  mdiEyeOffOutline,
  mdiEyeOutline,
  mdiOpenInNew,
  mdiRssBox,
  mdiStarShooting,
  mdiSteam,
  mdiTrashCanOutline,
  mdiVideoVintage,
} from "@mdi/js";
import Icon from "@mdi/react";
import type { IconProps } from "@mdi/react/dist/IconProps";
import { useContext, useEffect, useRef, useState } from "react";
import type { SWRInfiniteKeyedMutator } from "swr/infinite";

import message from "@/components/Message";
import GlobalContext from "@/contexts/GlobalContext";
import { fetcherDELETE, fetcherPATCH } from "@/services/axios";

import { SyncServiceType } from "../../../../enums";
import type {
  GetTimelineItemsParams,
  TimelineItemClient,
} from "../../../../interfaces/api";

export interface TimelineItemLabelProps {
  item: TimelineItemClient;
  mutateTimelineItems: SWRInfiniteKeyedMutator<TimelineItemClient[][]>;
  displayedDateTime?: GetTimelineItemsParams["orderBy"];
  className?: string;
}

const LABEL_ICON_PATH = {
  [SyncServiceType.BILIBILI_COLLECTION]: mdiBookmarkMultiple,
  [SyncServiceType.BILIBILI_WORK]: mdiVideoVintage,
  [SyncServiceType.FEED]: mdiRssBox,
  [SyncServiceType.GITHUB_ISSUE_COMMENT]: mdiCommentText,
  [SyncServiceType.QZONE_TALK]: mdiStarShooting,
  [SyncServiceType.STEAM_GAME_REVIEW]: mdiSteam,
} as Record<SyncServiceType, string>;

const LABEL_TEXT_COLOR = {
  [SyncServiceType.BILIBILI_COLLECTION]: "#fb7299",
  [SyncServiceType.BILIBILI_WORK]: "#fb7299",
  [SyncServiceType.FEED]: "#818cf8",
  [SyncServiceType.GITHUB_ISSUE_COMMENT]: "#fafaf9",
  [SyncServiceType.QZONE_TALK]: "#cc8f14",
  [SyncServiceType.STEAM_GAME_REVIEW]: "#95a1ae",
} as Record<SyncServiceType, string>;

const labelItemBaseClassName =
  "flex flex-row items-center text-sm lg:absolute lg:-right-4 lg:translate-x-full md:text-base !leading-none";
const labelIconBaseOptions: Partial<IconProps> = {
  className: "mr-1 size-4 md:size-5",
};

const getDisplayedDateTime = (date: Date) => {
  const inputDate = new Date(date);
  const months = inputDate.getMonth() + 1;
  const days = inputDate.getDate();
  const hours = inputDate.getHours();
  const minutes = inputDate.getMinutes();
  const dateString = `${String(months).padStart(2, "0")}/${String(days).padStart(2, "0")}`;
  const timeString = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  inputDate.setHours(0, 0, 0, 0);
  const timeDiff = today.getTime() - inputDate.getTime();
  const daysDiff = timeDiff / 86400000;

  if (daysDiff <= 7) {
    return `${
      ["今天", "昨天", "前天", "三天前", "四天前", "五天前", "六天前"][daysDiff]
    } ${timeString}`;
  }

  return `${dateString}, ${timeString}`;
};

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
    className = "",
    ...rest
  } = props;
  const { lastVisitDate, isLoggedIn } = useContext(GlobalContext);

  const [menuOpen, setMenuOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

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

  const displayedDateTimeString = getDisplayedDateTime(
    displayedDateTime === "updated_at" ? updatedAt : createdAt,
  );

  const isNewlyCreated = lastVisitDate && lastVisitDate < createdAt;
  const isNewlyUpdated = lastVisitDate && lastVisitDate < updatedAt;

  const hasMenu = isLoggedIn || url;

  return (
    <div
      className={`mb-3 flex select-none justify-between lg:mb-0 ${className}`}
      {...rest}
    >
      <div
        ref={hasMenu ? menuRef : undefined}
        onClick={() => hasMenu && setMenuOpen((v) => !v)}
        aria-haspopup={hasMenu ? "menu" : undefined}
        aria-expanded={hasMenu ? menuOpen : undefined}
        className={`${labelItemBaseClassName} relative z-10 font-bold text-primary lg:top-2 ${hasMenu ? "cursor-pointer" : ""}`}
        style={{ color: LABEL_TEXT_COLOR[sync_service_type] }}
      >
        <Icon
          path={LABEL_ICON_PATH[sync_service_type] ?? mdiCommentProcessing}
          {...labelIconBaseOptions}
        />
        <span>
          {label || sync_service_id}
          {(isNewlyCreated || isNewlyUpdated) && (
            <sup className="ml-1 opacity-75">
              <i>
                {isNewlyCreated ? "new" : isNewlyUpdated ? "updated" : null}
              </i>
            </sup>
          )}
          {is_secret && <sub className="ml-1 opacity-75">私密</sub>}
        </span>
        {hasMenu && menuOpen && (
          <div className="absolute left-0 top-0 z-50 w-32 rounded-md bg-background-light text-sm font-normal shadow-md shadow-background-lighter">
            <ul className="p-1">
              {url ? (
                <li>
                  <a
                    href={url}
                    target="_blank"
                    className="flex w-full items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-left text-foreground hover:bg-background-lighter"
                  >
                    <Icon path={mdiOpenInNew} size={0.7} />
                    打开链接
                  </a>
                </li>
              ) : null}
              {isLoggedIn ? (
                <>
                  <li>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpen(false);
                        handleToggleSecret();
                      }}
                      className="flex w-full items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-left text-foreground hover:bg-background-lighter"
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
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpen(false);
                        handleDelete();
                      }}
                      className="flex w-full items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-left text-red-400 hover:bg-background-lighter"
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
      <div className={`${labelItemBaseClassName} lg:top-10 2xl:top-11`}>
        <Icon
          path={hasUpdated ? mdiClockTimeSeven : mdiClockTimeFour}
          {...labelIconBaseOptions}
        />
        <span
          title={
            `创建于：${createdAtString}` +
            (hasUpdated ? `\n最后更新于：${updatedAtString}` : "")
          }
        >
          {displayedDateTimeString}
        </span>
      </div>
    </div>
  );
}
