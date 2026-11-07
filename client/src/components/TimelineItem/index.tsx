import { SyncServiceType } from "@timeline/contracts";
import React from "react";

import type { ExpandableContainerProps } from "@/components/ExpandableContainer";
import ExpandableContainer from "@/components/ExpandableContainer";
import TimelineItemBilibiliCollection from "@/components/TimelineItem/bilibili-collection";
import TimelineItemFeed from "@/components/TimelineItem/feed";
import TimelineItemFfxivUltimate from "@/components/TimelineItem/ffxiv-ultimate";
import TimelineItemGameAchievement from "@/components/TimelineItem/game-achievement";
import TimelineItemGithubIssueComment from "@/components/TimelineItem/github-issue-comment";
import TimelineItemQQZoneTalk from "@/components/TimelineItem/qq-zone-talk";
import TimelineItemSteamGameReview from "@/components/TimelineItem/steam-game-review";
import TimelineItemLabel, {
  type TimelineItemLabelProps,
} from "@/components/TimelineItemLabel";

export interface TimelineItemProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    Omit<TimelineItemLabelProps, "className"> {
  expanded: boolean;
  onItemExpandedChange: (id: string, expanded: boolean) => void;
}

const cardOutlineClass =
  "after:pointer-events-none after:absolute after:inset-0 after:z-10 after:rounded-[inherit] after:ring-1 after:ring-binding/60 after:ring-inset";

function TimelineItem(props: TimelineItemProps) {
  const {
    item,
    displayedDateTime,
    mutateTimelineItems,
    filters,
    onFiltersChange,
    expanded,
    onItemExpandedChange,
    className,
    ...rest
  } = props;
  const { sync_service_type } = item;

  let element = <></>;
  const expandableContainerProps: ExpandableContainerProps = {
    expandableHeightThresholdRatio: 0.8,
    expanded,
    onExpandedChange: (expanded) => onItemExpandedChange(item.id, expanded),
    className: `isolate rounded-lg ${cardOutlineClass}`,
  };

  switch (sync_service_type) {
    case SyncServiceType.FFXIV_ULTIMATE_ACHIEVEMENT:
      element = (
        <TimelineItemFfxivUltimate item={item} className={cardOutlineClass} />
      );
      break;
    case SyncServiceType.PSN_GAME_ACHIEVEMENT:
    case SyncServiceType.XBOX_GAME_ACHIEVEMENT:
    case SyncServiceType.STEAM_GAME_ACHIEVEMENT:
      element = (
        <TimelineItemGameAchievement
          item={item}
          className={cardOutlineClass}
          showCompletionDate={
            displayedDateTime === "updated_at" &&
            item.created_at !== item.updated_at
          }
        />
      );
      break;
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
      className={`timeline-item group/item relative min-w-0 pb-6 before:absolute before:top-4 before:-left-(--archive-gutter) before:size-1.5 before:-translate-1/2 before:rounded-full before:border ${className ?? ""}`}
      {...rest}
    >
      <TimelineItemLabel
        item={item}
        displayedDateTime={displayedDateTime}
        mutateTimelineItems={mutateTimelineItems}
        filters={filters}
        onFiltersChange={onFiltersChange}
      />
      {element}
    </div>
  );
}

export default React.memo(TimelineItem);
