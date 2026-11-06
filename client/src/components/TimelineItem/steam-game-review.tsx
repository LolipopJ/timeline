import { useEffect, useRef } from "react";

import GameCover from "@/components/TimelineItem/game-cover";
import type { TimelineComponent } from "@/interfaces/timeline";

export default function TimelineItemSteamGameReview(props: TimelineComponent) {
  const { item, className = "", ...rest } = props;

  const { content_id, title, content, url, attachments } = item;
  const isRecommended = title === "推荐";
  const recommendation = isRecommended ? "推荐" : "不推荐";
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const spoilers =
      contentRef.current?.querySelectorAll<HTMLElement>(".bb_spoiler");
    if (!spoilers) return;

    const cleanups = Array.from(spoilers, (spoiler) => {
      spoiler.setAttribute("role", "button");
      spoiler.tabIndex = 0;
      spoiler.setAttribute("aria-expanded", "false");
      spoiler.setAttribute("aria-label", "显示剧透");

      const toggle = () => {
        const expanded = spoiler.getAttribute("aria-expanded") !== "true";
        spoiler.setAttribute("aria-expanded", String(expanded));
        spoiler.setAttribute("aria-label", expanded ? "隐藏剧透" : "显示剧透");
      };
      const onClick = (event: MouseEvent) => {
        const target = event.target as HTMLElement;
        if (target.closest(".bb_spoiler") !== spoiler) return;
        // Preserve links inside revealed HTML; a first click only reveals them.
        if (
          spoiler.getAttribute("aria-expanded") === "true" &&
          target.closest("a, button, input, select, textarea")
        ) {
          return;
        }
        event.preventDefault();
        toggle();
      };
      const onKeyDown = (event: KeyboardEvent) => {
        if (
          event.target === spoiler &&
          !event.repeat &&
          (event.key === "Enter" || event.key === " ")
        ) {
          event.preventDefault();
          toggle();
        }
      };
      spoiler.addEventListener("click", onClick);
      spoiler.addEventListener("keydown", onKeyDown);
      return () => {
        spoiler.removeEventListener("click", onClick);
        spoiler.removeEventListener("keydown", onKeyDown);
      };
    });

    return () => cleanups.forEach((cleanup) => cleanup());
  }, [content]);

  return (
    <div className={`steam-game-review ${className}`} {...rest}>
      <article className="flex min-w-0 flex-col gap-4 bg-background-light px-4 py-6 sm:flex-row lg:gap-6 lg:px-6 lg:py-8">
        <div className="flex shrink-0 items-center gap-3 sm:w-28 sm:flex-col sm:items-stretch sm:gap-2">
          <a
            href={`https://steamcommunity.com/app/${content_id}`}
            target="_blank"
            rel="noreferrer"
            aria-label="打开 Steam 游戏社区"
            className="block w-20 shrink-0 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary sm:w-full"
          >
            <GameCover src={attachments?.[0]?.url} portrait />
          </a>
          <a
            href={url ?? undefined}
            target="_blank"
            rel="noreferrer"
            aria-label={`${recommendation} · 查看 Steam 评测`}
            className="flex items-center gap-2 rounded-sm bg-background-lighter pr-3 text-sm leading-none whitespace-nowrap text-foreground-dark hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={
                isRecommended
                  ? "https://community.steamstatic.com/public/shared/images/userreviews/icon_thumbsUp.png"
                  : "https://community.steamstatic.com/public/shared/images/userreviews/icon_thumbsDown.png"
              }
              alt=""
              width={34}
              height={34}
              className="size-8.5 rounded-l-sm"
              loading="lazy"
            />
            {recommendation}
          </a>
        </div>
        <div
          ref={contentRef}
          className="markdown-body min-w-0 flex-1"
          dangerouslySetInnerHTML={{ __html: String(content) }}
        />
      </article>
    </div>
  );
}
