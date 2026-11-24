import { useMemo, useState } from "react";

import type { TimelineComponent } from "@/interfaces/timeline";
import parseMarkdownToReactNode from "@/utils/markdown";

export default function TimelineItemFeed(props: TimelineComponent) {
  const { item, className = "", ...rest } = props;
  const [failedCover, setFailedCover] = useState<string>();

  const parsedNode = useMemo(() => {
    return item.content
      ? parseMarkdownToReactNode(item.content, item.id)
      : null;
  }, [item.content, item.id]);

  const coverUrl = item.attachments?.[0]?.url;
  const showCover = Boolean(coverUrl && failedCover !== coverUrl);
  const coverAlt = item.title ? `${item.title} 封面` : "文章封面";

  const coverImage = showCover && coverUrl && (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={coverUrl}
      alt={coverAlt}
      loading="lazy"
      decoding="async"
      onError={() => setFailedCover(coverUrl)}
      className="block size-full object-cover motion-safe:transition-transform motion-safe:duration-300 motion-safe:group-focus-within/cover:scale-101 motion-safe:group-hover/cover:scale-101"
    />
  );

  return (
    <div className={`feed ${className}`} {...rest}>
      <article className="bg-background-light">
        {coverImage &&
          (item.url ? (
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="group/cover block aspect-video overflow-hidden border-b border-binding/40 bg-background-lighter focus-visible:-outline-offset-2"
            >
              {coverImage}
            </a>
          ) : (
            <div className="aspect-video overflow-hidden border-b border-binding/40 bg-background-lighter">
              {coverImage}
            </div>
          ))}
        <div className="markdown-body max-w-none bg-background-light px-4 py-6 lg:px-6 lg:py-8">
          <h1 className="text-lg">
            <a
              href={item.url ?? undefined}
              className="rounded-sm bg-linear-to-r from-primary/35 to-primary/35 bg-size-[0%_100%] bg-bottom-left bg-no-repeat text-white no-underline transition-[background-size] duration-300 ease-out hover:bg-size-[100%_100%] focus-visible:bg-size-[100%_100%] motion-reduce:transition-none paper:text-foreground"
              target="_blank"
              rel="noreferrer"
            >
              {item.title}
            </a>
          </h1>
          {parsedNode && <div>{parsedNode}</div>}
        </div>
      </article>
    </div>
  );
}
