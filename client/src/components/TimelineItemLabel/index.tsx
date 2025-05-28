import {
  mdiBookmarkMultiple,
  mdiClockTimeFour,
  mdiClockTimeSeven,
  mdiCommentProcessing,
  mdiCommentText,
  mdiRssBox,
  mdiStarShooting,
  mdiVideoVintage,
} from "@mdi/js";
import Icon from "@mdi/react";
import type { IconProps } from "@mdi/react/dist/IconProps";

import { SyncServiceType } from "../../../../enums";
import type { TimelineItemClient } from "../../../../interfaces/api";

interface TimelineItemLabelProps {
  item: TimelineItemClient;
  className?: string;
}

const LABEL_ICON_PATH = {
  [SyncServiceType.BILIBILI_COLLECTION]: mdiBookmarkMultiple,
  [SyncServiceType.BILIBILI_WORK]: mdiVideoVintage,
  [SyncServiceType.FEED]: mdiRssBox,
  [SyncServiceType.GITHUB_ISSUE_COMMENT]: mdiCommentText,
  [SyncServiceType.QZONE_TALK]: mdiStarShooting,
} as Record<SyncServiceType, string>;

const LABEL_TEXT_COLOR = {
  [SyncServiceType.BILIBILI_COLLECTION]: "#fb7299",
  [SyncServiceType.BILIBILI_WORK]: "#fb7299",
  [SyncServiceType.FEED]: "#818cf8",
  [SyncServiceType.GITHUB_ISSUE_COMMENT]: "#f0f6fc",
  [SyncServiceType.QZONE_TALK]: "#cc8f14",
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
      [
        "今天",
        "昨天",
        "前天",
        "三天前",
        "四天前",
        "五天前",
        "六天前",
        "一周前",
      ][daysDiff]
    } ${timeString}`;
  }

  return `${dateString}, ${timeString}`;
};

export default function TimelineItemLabel(props: TimelineItemLabelProps) {
  const {
    item: { sync_service_type, created_at, updated_at, label, is_secret },
    className = "",
    ...rest
  } = props;

  const createdAt = new Date(created_at);
  const updatedAt = new Date(updated_at);
  const hasUpdated = updatedAt.getTime() !== createdAt.getTime();

  const createdAtString = createdAt.toLocaleString();
  const updatedAtString = updatedAt.toLocaleString();

  const createdAtDisplayString = getDisplayedDateTime(createdAt);

  return (
    <div
      className={`mb-3 flex select-none justify-between lg:mb-0 ${className}`}
      {...rest}
    >
      <div
        className={`${labelItemBaseClassName} font-bold text-primary lg:top-2`}
        style={{ color: LABEL_TEXT_COLOR[sync_service_type] }}
      >
        <Icon
          path={LABEL_ICON_PATH[sync_service_type] ?? mdiCommentProcessing}
          {...labelIconBaseOptions}
        />
        <span>
          {label}
          {is_secret && " (私密)"}
        </span>
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
          {createdAtDisplayString}
        </span>
      </div>
    </div>
  );
}
