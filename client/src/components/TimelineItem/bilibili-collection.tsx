import type { TimelineComponent } from "@/interfaces/timeline";

export default function TimelineItemBilibiliCollection(
  props: TimelineComponent,
) {
  const { item, className = "", ...rest } = props;
  const cover = item.attachments?.[0];
  const startsWithOpeningPunctuation = /^[「『【（《〈〔〖〘〚［｛]/.test(
    item.title ?? "",
  );

  return (
    <div className={className} {...rest}>
      {cover && (
        <a
          href={item.url ?? undefined}
          target="_blank"
          rel="noreferrer"
          aria-label={item.title ?? "打开 Bilibili 原始链接"}
          className="group/cover relative block aspect-video overflow-hidden bg-background-light focus-visible:-outline-offset-2"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt={item.title ? `${item.title} 封面` : "Bilibili 封面"}
            src={cover.url}
            className="size-full object-cover motion-safe:transition-transform motion-safe:duration-300 motion-safe:group-focus-within/cover:scale-101 motion-safe:group-hover/cover:scale-101"
          />
          <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/95 via-black/85 to-transparent px-4 pt-10 pb-3 text-foreground paper:from-background-light paper:via-background-light/95">
            <h1
              className={`line-clamp-1 text-base font-semibold md:text-lg ${startsWithOpeningPunctuation ? "-ms-2.5" : ""}`}
              title={item.title ?? undefined}
            >
              {item.title}
            </h1>
            {item.content && (
              <p
                className="mt-1 line-clamp-2 text-sm whitespace-pre-wrap sm:line-clamp-4"
                title={item.content}
              >
                {item.content}
              </p>
            )}
          </div>
        </a>
      )}
    </div>
  );
}
