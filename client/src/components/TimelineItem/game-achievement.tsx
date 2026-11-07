import {
  mdiMicrosoftXbox,
  mdiSonyPlaystation,
  mdiSteam,
  mdiTrophy,
  mdiTrophyAward,
  mdiTrophyOutline,
} from "@mdi/js";
import Icon from "@mdi/react";
import { useRef } from "react";

import GameCover from "@/components/TimelineItem/game-cover";
import type { TimelineComponent } from "@/interfaces/timeline";

const platforms = {
  psn: {
    name: "PlayStation",
    icon: mdiSonyPlaystation,
    accent:
      "[--achievement-accent:var(--color-sky-300)] paper:[--achievement-accent:var(--color-sky-800)]",
    texture:
      "bg-[repeating-linear-gradient(116deg,transparent_0_7px,currentColor_8px,transparent_9px_12px,currentColor_13px,transparent_14px_24px)]",
  },
  xbox: {
    name: "Xbox",
    icon: mdiMicrosoftXbox,
    accent:
      "[--achievement-accent:var(--color-green-400)] paper:[--achievement-accent:var(--color-green-800)]",
    texture:
      "bg-[repeating-linear-gradient(45deg,currentColor_0_1px,transparent_1px_22px),repeating-linear-gradient(-45deg,currentColor_0_1px,transparent_1px_22px)]",
  },
  steam: {
    name: "Steam",
    icon: mdiSteam,
    accent:
      "[--achievement-accent:var(--color-indigo-300)] paper:[--achievement-accent:var(--color-indigo-800)]",
    texture:
      "bg-[repeating-radial-gradient(circle_at_100%_5%,transparent_0_14px,currentColor_15px,transparent_16px_23px)]",
  },
};
const milestones = {
  platinum: {
    name: "白金奖杯",
    caption: "本体完成",
    icon: mdiTrophyAward,
    color: "text-sky-400 paper:text-sky-800",
    background:
      "from-sky-400/20 to-sky-400/5 paper:from-sky-500/30 paper:to-sky-500/10",
  },
  mythic: {
    name: "Mythic",
    caption: "本体完成",
    icon: mdiTrophyOutline,
    color: "text-green-400 paper:text-green-800",
    background:
      "from-green-400/20 to-green-400/5 paper:from-green-500/30 paper:to-green-500/10",
  },
  base_completion: {
    name: "本体全成就",
    caption: "本体完成",
    icon: mdiTrophyOutline,
    color: "text-amber-300 paper:text-amber-900",
    background:
      "from-amber-300/20 to-amber-300/5 paper:from-amber-400/30 paper:to-amber-400/10",
  },
  all_achievements: {
    name: "全成就",
    caption: "完整成就集合",
    icon: mdiTrophy,
    color: "text-amber-400 paper:text-amber-800",
    background:
      "from-amber-400/20 to-amber-400/5 paper:from-amber-500/30 paper:to-amber-500/10",
  },
};

export default function TimelineItemGameAchievement({
  item,
  className = "",
  showCompletionDate,
  ...rest
}: TimelineComponent & { showCompletionDate?: boolean }) {
  const trophyRef = useRef<HTMLSpanElement>(null);
  const achievement = item.achievement;
  if (!achievement) return null;
  const platform = platforms[achievement.platform];
  const milestone = milestones[achievement.kind];
  const portrait = achievement.platform === "steam";
  const title = item.title ?? achievement.gameId;

  function playAnimation() {
    const trophy = trophyRef.current;
    if (
      !trophy ||
      matchMedia("(prefers-reduced-motion: reduce)").matches ||
      trophy.getAnimations().length > 0
    ) {
      return;
    }

    const duration = 720;
    trophy.animate(
      [
        { translate: "0 0", easing: "ease-out" },
        { translate: "0 -0.125rem", offset: 0.4, easing: "ease-in-out" },
        { translate: "0 0" },
      ],
      duration,
    );
  }

  return (
    <article
      className={`group/achievement relative isolate flex min-w-0 gap-4 overflow-hidden rounded-lg bg-background-light bg-linear-to-bl from-(--achievement-accent)/15 to-transparent to-65% p-4 sm:gap-6 sm:p-6 paper:from-(--achievement-accent)/10 ${platform.accent} ${className}`}
      {...rest}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") playAnimation();
      }}
      onFocus={(event) => {
        if (event.target.matches(":focus-visible")) playAnimation();
      }}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 -z-10 mask-[linear-gradient(90deg,transparent_15%,black_90%)] text-(--achievement-accent) opacity-25 paper:opacity-15 ${platform.texture}`}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 -translate-x-full bg-linear-[110deg,transparent_35%,currentColor_50%,transparent_65%] text-(--achievement-accent) opacity-10 motion-safe:transition-transform motion-safe:duration-1000 motion-safe:group-focus-within/achievement:translate-x-full motion-safe:group-hover/achievement:translate-x-full"
      />
      <GameCover
        src={item.attachments?.[0]?.url}
        portrait={portrait}
        className={`w-16 shrink-0 self-start sm:w-24 ${portrait ? "" : "h-21.5 sm:h-32"}`}
      />
      <div className="min-w-0 flex-1 self-center">
        <div className="mb-2 flex items-center gap-2 text-xs font-medium text-(--achievement-accent)">
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
          className={`inline-flex max-w-full items-center gap-1.5 rounded-full bg-linear-to-r px-2.5 py-1 text-sm font-semibold ring-1 ring-current/25 ring-inset ${milestone.color} ${milestone.background}`}
        >
          <span ref={trophyRef} className="size-4 shrink-0" aria-hidden="true">
            <Icon path={milestone.icon} className="size-full" />
          </span>
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
