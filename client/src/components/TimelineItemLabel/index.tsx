import {
  mdiBookmarkMultiple,
  mdiCheckboxMultipleMarkedOutline,
  mdiCommentProcessing,
  mdiCommentText,
  mdiEyeOffOutline,
  mdiEyeOutline,
  mdiFilterOutline,
  mdiFolderMultipleOutline,
  mdiLinkVariant,
  mdiOpenInNew,
  mdiRssBox,
  mdiStarShooting,
  mdiSteam,
  mdiSwordCross,
  mdiTrashCanOutline,
  mdiTrophyVariant,
  mdiVideoVintage,
} from "@mdi/js";
import Icon from "@mdi/react";
import type {
  GetTimelineItemsParams,
  TimelineItemClient,
} from "@timeline/contracts";
import { SyncServiceType } from "@timeline/contracts";
import { useCallback, useContext, useEffect, useRef, useState } from "react";

import message from "@/components/Message";
import CollectionEditor from "@/components/TimelineCollections/editor";
import GlobalContext from "@/contexts/GlobalContext";
import { fetcherDELETE, fetcherPATCH } from "@/services/axios";
import {
  getTimelineFilterUrl,
  type TimelineFilters,
  type TimelineFiltersChange,
} from "@/utils/timelineFilters";

export interface TimelineItemLabelProps {
  item: TimelineItemClient;
  onTimelineChanged: () => void;
  displayedDateTime?: GetTimelineItemsParams["orderBy"];
  className?: string;
  filters: TimelineFilters;
  onFiltersChange: TimelineFiltersChange;
  selected?: boolean;
  onToggleSelection: (id: string) => void;
}

const LABEL_ICON_PATH: Partial<Record<SyncServiceType, string>> = {
  [SyncServiceType.BILIBILI_COLLECTION]: mdiBookmarkMultiple,
  [SyncServiceType.BILIBILI_WORK]: mdiVideoVintage,
  [SyncServiceType.FEED]: mdiRssBox,
  [SyncServiceType.GITHUB_ISSUE_COMMENT]: mdiCommentText,
  [SyncServiceType.QZONE_TALK]: mdiStarShooting,
  [SyncServiceType.STEAM_GAME_REVIEW]: mdiSteam,
  [SyncServiceType.PSN_GAME_ACHIEVEMENT]: mdiTrophyVariant,
  [SyncServiceType.XBOX_GAME_ACHIEVEMENT]: mdiTrophyVariant,
  [SyncServiceType.STEAM_GAME_ACHIEVEMENT]: mdiTrophyVariant,
  [SyncServiceType.FFXIV_ULTIMATE_ACHIEVEMENT]: mdiSwordCross,
};

const LABEL_ICON_COLOR: Partial<Record<SyncServiceType, string>> = {
  [SyncServiceType.BILIBILI_COLLECTION]: "#fb7299",
  [SyncServiceType.BILIBILI_WORK]: "#fb7299",
  [SyncServiceType.FEED]: "#818cf8",
  [SyncServiceType.GITHUB_ISSUE_COMMENT]: "oklch(55.4% 0.046 257.417)",
  [SyncServiceType.QZONE_TALK]: "#cc8f14",
  [SyncServiceType.STEAM_GAME_REVIEW]: "#95a1ae",
  [SyncServiceType.PSN_GAME_ACHIEVEMENT]: "oklch(85.2% 0.199 91.936)",
  [SyncServiceType.XBOX_GAME_ACHIEVEMENT]: "oklch(85.2% 0.199 91.936)",
  [SyncServiceType.STEAM_GAME_ACHIEVEMENT]: "oklch(85.2% 0.199 91.936)",
  [SyncServiceType.FFXIV_ULTIMATE_ACHIEVEMENT]: "oklch(82.8% 0.189 84.429)",
};

const tagClass =
  "rounded-sm border border-binding bg-background-lighter px-1.5 py-0.5 text-xs wrap-anywhere";

const twoDigits = (value: number) => String(value).padStart(2, "0");

function formatDateTime(date: Date) {
  return `${twoDigits(date.getMonth() + 1)}/${twoDigits(date.getDate())} ${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}`;
}

type ItemAction = "secret" | "delete";

function focusControl(button: HTMLButtonElement | null) {
  button?.focus({ preventScroll: true });
}

export default function TimelineItemLabel(props: TimelineItemLabelProps) {
  const {
    item: {
      id,
      title,
      sync_service_id,
      sync_service_type,
      created_at,
      updated_at,
      label,
      url,
      is_secret,
      collectionLabels,
    },
    displayedDateTime = "created_at",
    onTimelineChanged,
    filters,
    onFiltersChange,
    selected,
    onToggleSelection,
    className = "",
    ...rest
  } = props;
  const { lastVisitDate, canManageItems } = useContext(GlobalContext);
  const showItemActions = canManageItems && selected === undefined;

  const [menuOpen, setMenuOpen] = useState(false);
  const [editingCollections, setEditingCollections] = useState(false);
  const [confirmingAction, setConfirmingAction] = useState<ItemAction | null>(
    null,
  );
  const [submitting, setSubmitting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  const dismissMenu = useCallback(() => {
    setMenuOpen(false);
    setConfirmingAction(null);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    function dismissOutside(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !menuRef.current?.contains(event.target)
      ) {
        dismissMenu();
      }
    }
    document.addEventListener("pointerdown", dismissOutside);
    return () => document.removeEventListener("pointerdown", dismissOutside);
  }, [dismissMenu, menuOpen]);

  function closeMenu() {
    dismissMenu();
    focusControl(menuButtonRef.current);
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

  async function confirmAction() {
    const action = confirmingAction;
    if (!action || submitting || !canManageItems) return;

    closeMenu();
    setSubmitting(true);
    try {
      if (action === "delete") {
        await fetcherDELETE(`/timeline-items/${id}`);
        message.success("已删除");
      } else {
        const nextIsSecret = !is_secret;
        await fetcherPATCH(`/timeline-items/${id}`, {
          is_secret: nextIsSecret,
        });
        message.success(nextIsSecret ? "已设为私密" : "已设为公开");
      }
      onTimelineChanged();
    } catch (error) {
      message.error(String(error));
    } finally {
      setSubmitting(false);
    }
  }

  const actions = [
    {
      action: "secret",
      icon: is_secret ? mdiEyeOutline : mdiEyeOffOutline,
      label: is_secret ? "设为公开" : "设为私密",
      prompt: is_secret ? "将该条目设为公开？" : "将该条目设为私密？",
    },
    {
      action: "delete",
      icon: mdiTrashCanOutline,
      label: "删除条目",
      prompt: "删除该条目？",
    },
  ] as const;

  const createdAt = new Date(created_at);
  const createdAtString = createdAt.toLocaleString();
  const updatedAt = new Date(updated_at);
  const updatedAtString = updatedAt.toLocaleString();
  const hasUpdated = updatedAt.getTime() !== createdAt.getTime();

  const displayedDate =
    displayedDateTime === "updated_at" ? updatedAt : createdAt;

  const displayedDateText = formatDateTime(displayedDate);
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
        className="font-mono text-xs whitespace-nowrap text-foreground-dark tabular-nums lg:absolute lg:top-4 lg:right-[calc(100%+var(--archive-gutter)+0.75rem)] lg:-translate-y-1/2 lg:group-focus-within/item:text-foreground-dark lg:group-hover/item:text-foreground motion-safe:lg:transition-colors"
        dateTime={displayedDateTime === "updated_at" ? updated_at : created_at}
        title={
          `创建于：${createdAtString}` +
          (hasUpdated ? `\n最后更新于：${updatedAtString}` : "")
        }
      >
        {displayedDateText}
      </time>
      <div
        ref={menuRef}
        className="relative max-w-full min-w-0"
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) dismissMenu();
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
          onClick={() => {
            if (menuOpen) dismissMenu();
            else setMenuOpen(true);
          }}
          aria-expanded={menuOpen}
          className="flex min-h-8 cursor-pointer items-center gap-1.5 rounded-sm font-medium"
        >
          {source}
        </button>
        <div
          data-open={menuOpen}
          inert={!menuOpen}
          className={`absolute top-full left-0 z-10 w-max rounded-md border border-control bg-background-light text-sm font-normal shadow-lg motion-safe:archive-disclosure ${menuOpen ? "" : "hidden"}`}
        >
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
                    serviceLabel: label || sync_service_id,
                  }));
                }}
                className="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left whitespace-nowrap text-foreground hover:bg-background-lighter"
              >
                <Icon path={mdiFilterOutline} size={0.7} aria-hidden="true" />
                只看当前类型
              </button>
            </li>
            {showItemActions && (
              <li>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => {
                    closeMenu();
                    onToggleSelection(id);
                  }}
                  className="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left whitespace-nowrap text-foreground hover:bg-background-lighter disabled:opacity-60"
                >
                  <Icon
                    path={mdiCheckboxMultipleMarkedOutline}
                    size={0.7}
                    aria-hidden="true"
                  />
                  多选
                </button>
              </li>
            )}
            {showItemActions && (
              <li>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => {
                    closeMenu();
                    setEditingCollections(true);
                  }}
                  className="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left whitespace-nowrap text-foreground hover:bg-background-lighter disabled:opacity-60"
                >
                  <Icon
                    path={mdiFolderMultipleOutline}
                    size={0.7}
                    aria-hidden="true"
                  />
                  编辑合集
                </button>
              </li>
            )}
            {showItemActions &&
              actions.map(({ action, icon, label, prompt }) => (
                <li key={action}>
                  {confirmingAction === action ? (
                    <div className="space-y-2 rounded-md border border-binding bg-background px-3 py-2">
                      <p className="text-foreground">{prompt}</p>
                      <div className="flex justify-end gap-2">
                        <button
                          ref={focusControl}
                          type="button"
                          onClick={() => {
                            focusControl(menuButtonRef.current);
                            setConfirmingAction(null);
                          }}
                          className="cursor-pointer rounded-md border border-control px-3 py-1.5 text-foreground hover:bg-background-lighter"
                        >
                          取消
                        </button>
                        <button
                          type="button"
                          onClick={confirmAction}
                          className={`cursor-pointer rounded-md border border-current px-3 py-1.5 font-medium hover:bg-background-lighter ${action === "delete" ? "text-danger" : "text-primary"}`}
                        >
                          确认
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => {
                        focusControl(menuButtonRef.current);
                        setConfirmingAction(action);
                      }}
                      className={`flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left whitespace-nowrap hover:bg-background-lighter disabled:opacity-60 ${action === "delete" ? "text-danger" : "text-foreground"}`}
                    >
                      <Icon path={icon} size={0.7} aria-hidden="true" />
                      {label}
                    </button>
                  )}
                </li>
              ))}
          </ul>
        </div>
      </div>
      {canManageItems && selected !== undefined && (
        <label className="grid size-8 shrink-0 cursor-pointer place-items-center">
          <input
            type="checkbox"
            aria-label={`选择条目：${title || `${label || sync_service_id} ${displayedDateText}`}`}
            checked={selected}
            className="size-5 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            onChange={() => onToggleSelection(id)}
          />
        </label>
      )}
      {is_secret && <span className={`${tagClass} text-warning`}>私密</span>}
      {(isNewlyCreated || isNewlyUpdated) && (
        <span className={`${tagClass} text-primary`}>
          {isNewlyCreated ? "新增" : "已更新"}
        </span>
      )}
      {collectionLabels.length > 0 && (
        <ul aria-label="归属合集" className="flex min-w-0 flex-wrap gap-1">
          {collectionLabels.map(({ id, name }) => (
            <li key={id} className={`${tagClass} text-foreground-dark`}>
              {name}
            </li>
          ))}
        </ul>
      )}
      {canManageItems && editingCollections && (
        <CollectionEditor
          itemId={id}
          onClose={() => setEditingCollections(false)}
          onSaved={onTimelineChanged}
        />
      )}
    </div>
  );
}
