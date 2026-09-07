import React from "react";

import ExpandableContainer, {
  ExpandableContainerProps,
} from "@/components/ExpandableContainer";
import TimelineItemBilibiliCollection from "@/components/TimelineItem/bilibili-collection";
import TimelineItemFeed from "@/components/TimelineItem/feed";
import TimelineItemGithubIssueComment from "@/components/TimelineItem/github-issue-comment";
import TimelineItemQQZoneTalk from "@/components/TimelineItem/qq-zone-talk";
import TimelineItemSteamGameReview from "@/components/TimelineItem/steam-game-review";
import TimelineItemLabel, {
  type TimelineItemLabelProps,
} from "@/components/TimelineItemLabel";

import { SyncServiceType } from "../../../../enums";

export interface TimelineItemProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    Omit<TimelineItemLabelProps, "className"> {}

function TimelineItem(props: TimelineItemProps) {
  const { item, displayedDateTime, mutateTimelineItems, className, ...rest } =
    props;
  const { sync_service_type } = item;

  let element = <></>;
  const expandableContainerProps: ExpandableContainerProps = {
    expandableHeightThresholdRatio: 0.8,
    className: "rounded-lg",
  };

  switch (sync_service_type) {
    case SyncServiceType.BILIBILI_COLLECTION:
    case SyncServiceType.BILIBILI_WORK:
      element = (
        <ExpandableContainer
          {...expandableContainerProps}
          expandableHeightThresholdRatio={Infinity}
        >
          <TimelineItemBilibiliCollection item={item} />
        </ExpandableContainer>
      );
      break;
    case SyncServiceType.FEED:
      element = (
        <ExpandableContainer {...expandableContainerProps}>
          <TimelineItemFeed item={item} />
        </ExpandableContainer>
      );
      break;
    case SyncServiceType.GITHUB_ISSUE_COMMENT:
      element = (
        <ExpandableContainer {...expandableContainerProps}>
          <TimelineItemGithubIssueComment item={item} />
        </ExpandableContainer>
      );
      break;
    case SyncServiceType.QZONE_TALK:
      element = (
        <ExpandableContainer {...expandableContainerProps}>
          <TimelineItemQQZoneTalk item={item} />
        </ExpandableContainer>
      );
      break;
    case SyncServiceType.STEAM_GAME_REVIEW:
      element = (
        <ExpandableContainer {...expandableContainerProps}>
          <TimelineItemSteamGameReview item={item} />
        </ExpandableContainer>
      );
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
      <TimelineItemLabel
        item={item}
        displayedDateTime={displayedDateTime}
        mutateTimelineItems={mutateTimelineItems}
      />
      {element}
    </div>
  );
}

export default React.memo(TimelineItem);
