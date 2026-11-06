import {
  mdiMicrosoftXbox,
  mdiSonyPlaystation,
  mdiSteam,
  mdiTrophyAward,
  mdiTrophyOutline,
} from "@mdi/js";
import Icon from "@mdi/react";

import GameCover from "@/components/TimelineItem/game-cover";
import type { TimelineComponent } from "@/interfaces/timeline";

const platforms = {
  psn: { name: "PlayStation", icon: mdiSonyPlaystation },
  xbox: { name: "Xbox", icon: mdiMicrosoftXbox },
  steam: { name: "Steam", icon: mdiSteam },
};
const milestones = {
  platinum: {
    name: "白金奖杯",
    caption: "本体完成",
    color: "text-sky-400 paper:text-sky-800",
  },
  mythic: {
    name: "Mythic",
    caption: "本体完成",
    color: "text-green-400 paper:text-green-800",
  },
  base_completion: {
    name: "本体全成就",
    caption: "本体完成",
    color: "text-amber-400 paper:text-amber-800",
  },
  all_achievements: {
    name: "全成就",
    caption: "完整成就集合",
    color: "text-amber-400 paper:text-amber-800",
  },
};

export default function TimelineItemGameAchievement({
  item,
  className = "",
  showCompletionDate,
  ...rest
}: TimelineComponent & { showCompletionDate?: boolean }) {
  const achievement = item.achievement;
  if (!achievement) return null;
  const platform = platforms[achievement.platform];
  const milestone = milestones[achievement.kind];
  const portrait = achievement.platform === "steam";
  const title = item.title ?? achievement.gameId;
  return (
    <article
      className={`flex min-w-0 gap-4 rounded-lg border border-control bg-background-light p-4 sm:gap-6 sm:p-6 ${className}`}
      {...rest}
    >
      <GameCover
        src={item.attachments?.[0]?.url}
        portrait={portrait}
        className={`w-16 shrink-0 self-start sm:w-24 ${portrait ? "" : "h-21.5 sm:h-32"}`}
      />
      <div className="min-w-0 flex-1 self-center">
        <div className="mb-2 flex items-center gap-2 text-xs text-foreground-dark">
          <Icon
            path={platform.icon}
            className="size-4 shrink-0"
            aria-hidden="true"
          />
          <span>{platform.name}</span>
        </div>
        <h2 className="mb-3 text-base leading-snug font-semibold wrap-anywhere sm:text-lg">
          {item.url ? (
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
              aria-label={`${title} · ${platform.name} 成就页面`}
            >
              {title}
            </a>
          ) : (
            title
          )}
        </h2>
        <div
          className={`flex items-center gap-2 font-medium ${milestone.color}`}
        >
          <Icon
            path={
              achievement.kind === "platinum"
                ? mdiTrophyAward
                : mdiTrophyOutline
            }
            className="size-5 shrink-0"
            aria-hidden="true"
          />
          <span>{milestone.name}</span>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-foreground-dark">
          {milestone.caption}
          {achievement.earnedCount !== undefined &&
            achievement.totalCount !== undefined && (
              <>
                {" "}
                · 达成时 {achievement.earnedCount}/{achievement.totalCount}
              </>
            )}
        </p>
        {showCompletionDate && (
          <p className="mt-1 text-xs text-foreground-dark">
            达成于{" "}
            <time dateTime={item.created_at}>
              {new Date(item.created_at).toLocaleString()}
            </time>
          </p>
        )}
      </div>
    </article>
  );
}
