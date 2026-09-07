import type { TimelineComponent } from "@/interfaces/timeline";

export default function TimelineItemSteamGameReview(props: TimelineComponent) {
  const { item, className = "", ...rest } = props;

  const { content_id, title, content, url, attachments } = item;
  const isRecommended = title === "推荐";

  return (
    <div className={`steam-game-review ${className}`} {...rest}>
      <article className="markdown-body flex flex-col px-4 py-6 sm:flex-row lg:px-6 lg:py-8">
        <div className="mb-2 mr-0 w-[184px] flex-shrink-0 sm:mb-0 sm:mr-4 lg:mr-6">
          {!!attachments?.length && (
            <a
              href={`https://steamcommunity.com/app/${content_id}`}
              target="_blank"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={attachments[0].url}
                alt={attachments[0].filename}
                className="h-[69px] rounded-b-none"
                style={{ marginLeft: 0 }}
                loading="lazy"
              />
            </a>
          )}
          <div className="flex items-center rounded-b bg-background-lighter">
            <a href={url} target="_blank">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={
                  isRecommended
                    ? "https://community.steamstatic.com/public/shared/images/userreviews/icon_thumbsUp.png"
                    : "https://community.steamstatic.com/public/shared/images/userreviews/icon_thumbsDown.png"
                }
                alt={isRecommended ? "Recommended" : "Not Recommended"}
                className="h-[34px] w-[34px]"
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
          className="flex-auto"
          dangerouslySetInnerHTML={{ __html: String(content) }}
        />
      </article>
    </div>
  );
}
