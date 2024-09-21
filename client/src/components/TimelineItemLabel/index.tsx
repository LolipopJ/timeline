import {
  mdiBookmarkMultiple,
  mdiClockTimeFive,
  mdiClockTimeFour,
  mdiCommentProcessing,
  mdiCommentText,
  mdiRssBox,
} from "@mdi/js";
import Icon from "@mdi/react";
import type { IconProps } from "@mdi/react/dist/IconProps";

import { SyncServiceType } from "../../../../enums";
import type { TimelineItemClient } from "../../../../interfaces/api";

interface TimelineItemLabelProps {
  item: TimelineItemClient;
  className?: string;
}

const getLabelIconPath = (type: SyncServiceType) => {
  let path = mdiCommentProcessing;

  switch (type) {
    case SyncServiceType.BILIBILI_COLLECTION:
      path = mdiBookmarkMultiple;
      break;
    case SyncServiceType.FEED:
      path = mdiRssBox;
      break;
    case SyncServiceType.GITHUB_ISSUE_COMMENT:
      path = mdiCommentText;
      break;
  }

  return path;
};

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

  const createdAt = new Date(created_at).toLocaleString();
  const updatedAt = new Date(updated_at).toLocaleString();
  const hasUpdated = updatedAt !== createdAt;

  return (
    <div
      className={`mb-3 flex select-none justify-between lg:mb-0 ${className}`}
      {...rest}
    >
      <div
        className={`${labelItemBaseClassName} text-primary font-bold lg:top-2`}
      >
        <Icon
          path={getLabelIconPath(sync_service_type)}
          {...labelIconBaseOptions}
        />
        <span>{label}</span>
      </div>
      <div className={`${labelItemBaseClassName} lg:top-10 2xl:top-11`}>
        <Icon
          path={hasUpdated ? mdiClockTimeFive : mdiClockTimeFour}
          {...labelIconBaseOptions}
        />
        <span
          title={
            hasUpdated ? `最后更新于：${updatedAt}` : `创建于：${createdAt}`
          }
        >
          {createdAt}
        </span>
      </div>
    </div>
  );
}
