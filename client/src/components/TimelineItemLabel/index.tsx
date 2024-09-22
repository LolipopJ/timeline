import {
  mdiBookmarkMultiple,
  mdiClockTimeFour,
  mdiClockTimeSeven,
  mdiCommentProcessing,
  mdiCommentText,
  mdiRssBox,
} from "@mdi/js";
import Icon from "@mdi/react";
import type { IconProps } from "@mdi/react/dist/IconProps";

import { getDateLocaleString } from "@/utils/date";

import { SyncServiceType } from "../../../../enums";
import type { TimelineItemClient } from "../../../../interfaces/api";

interface TimelineItemLabelProps {
  item: TimelineItemClient;
  className?: string;
}

const LABEL_ICON_PATH = {
  [SyncServiceType.BILIBILI_COLLECTION]: mdiBookmarkMultiple,
  [SyncServiceType.FEED]: mdiRssBox,
  [SyncServiceType.GITHUB_ISSUE_COMMENT]: mdiCommentText,
} as Record<SyncServiceType, string>;

const LABEL_TEXT_COLOR = {
  [SyncServiceType.BILIBILI_COLLECTION]: "#fb7299",
  [SyncServiceType.FEED]: "#818cf8",
} as Record<SyncServiceType, string>;

const labelItemBaseClassName =
  "flex flex-row items-center text-sm lg:absolute lg:-right-4 lg:translate-x-full md:text-base 2xl:text-lg";
const labelIconBaseOptions: Partial<IconProps> = {
  size: 0.75,
  className: "mr-1",
};

export default function TimelineItemLabel(props: TimelineItemLabelProps) {
  const {
    item: { sync_service_type, created_at, updated_at, label },
    className = "",
    ...rest
  } = props;

  const createdAt = new Date(created_at);
  const updatedAt = new Date(updated_at);
  const hasUpdated = updatedAt.getTime() !== createdAt.getTime();

  const createdAtString = createdAt.toLocaleString();
  const updatedAtString = updatedAt.toLocaleString();

  const createdAtDisplayString = getDateLocaleString(createdAt);

  return (
    <div
      className={`mb-3 flex select-none justify-between lg:mb-0 ${className}`}
      {...rest}
    >
      <div
        className={`${labelItemBaseClassName} text-primary font-bold lg:top-2`}
        style={{ color: LABEL_TEXT_COLOR[sync_service_type] }}
      >
        <Icon
          path={LABEL_ICON_PATH[sync_service_type] ?? mdiCommentProcessing}
          {...labelIconBaseOptions}
        />
        <span>{label}</span>
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
