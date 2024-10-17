import React from "react";

import TimelineItemBilibiliCollection from "@/components/TimelineItem/bilibili-collection";
import TimelineItemFeed from "@/components/TimelineItem/feed";
import TimelineItemGithubIssueComment from "@/components/TimelineItem/github-issue-comment";
import TimelineItemQQZoneTalk from "@/components/TimelineItem/qq-zone-talk";
import TimelineItemLabel from "@/components/TimelineItemLabel";
import { TimelineComponent } from "@/interfaces/timeline";

import { SyncServiceType } from "../../../../enums";
import type { TimelineItemClient } from "../../../../interfaces/api";

export interface TimelineItemProps
  extends React.HTMLAttributes<HTMLDivElement> {
  item: TimelineItemClient;
}

function TimelineItem(props: TimelineItemProps) {
  const { item, className, ...rest } = props;
  const { sync_service_type } = item;

  let element = <></>;
  const elementProps: TimelineComponent = {
    item,
    className: "rounded-lg overflow-hidden",
  };

  switch (sync_service_type) {
    case SyncServiceType.BILIBILI_COLLECTION:
      element = <TimelineItemBilibiliCollection {...elementProps} />;
      break;
    case SyncServiceType.FEED:
      element = <TimelineItemFeed {...elementProps} />;
      break;
    case SyncServiceType.GITHUB_ISSUE_COMMENT:
      element = <TimelineItemGithubIssueComment {...elementProps} />;
      break;
    case SyncServiceType.QZONE_TALK:
      element = <TimelineItemQQZoneTalk {...elementProps} />;
      break;
    default:
      element = <div>{JSON.stringify(item)}</div>;
      console.warn(`Unknown timeline item type \`${sync_service_type}\``);
  }

  return (
    <div
      className={`timeline-item relative flex flex-col ${className}`}
      {...rest}
    >
      <TimelineItemLabel item={item} />
      {element}
    </div>
  );
}

export default React.memo(TimelineItem);
