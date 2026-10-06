import { useEffect, useRef } from "react";

import type { TimelineComponent } from "@/interfaces/timeline";

export default function TimelineItemSteamGameReview(props: TimelineComponent) {
  const { item, className = "", ...rest } = props;

  const { content_id, title, content, url, attachments } = item;
  const isRecommended = title === "推荐";
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
      <article className="markdown-body flex flex-col px-4 py-6 sm:flex-row lg:px-6 lg:py-8">
        <div className="mr-0 mb-2 w-46 shrink-0 sm:mr-4 sm:mb-0 lg:mr-6">
          {!!attachments?.length && (
            <a
              href={`https://steamcommunity.com/app/${content_id}`}
              target="_blank"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={attachments[0].url}
                alt={attachments[0].filename}
                className="h-[86px] rounded-b-none"
                style={{ marginLeft: 0 }}
                loading="lazy"
              />
            </a>
          )}
          <div className="flex items-center rounded-b-sm bg-background-lighter">
            <a href={url ?? undefined} target="_blank">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={
                  isRecommended
                    ? "https://community.steamstatic.com/public/shared/images/userreviews/icon_thumbsUp.png"
                    : "https://community.steamstatic.com/public/shared/images/userreviews/icon_thumbsDown.png"
                }
                alt={isRecommended ? "Recommended" : "Not Recommended"}
                className="size-[34px]"
                style={{ marginLeft: 0, marginRight: 0 }}
                loading="lazy"
              />
            </a>
            <span className="ml-2 text-sm leading-none text-foreground-dark">
              {isRecommended ? "推荐" : "不推荐"}
            </span>
          </div>
        </div>
        <div
          ref={contentRef}
          className="flex-auto"
          dangerouslySetInnerHTML={{ __html: String(content) }}
        />
      </article>
    </div>
  );
}
