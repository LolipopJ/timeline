import { useMemo } from "react";

import type { TimelineComponent } from "@/interfaces/timeline";
import { wrapImgWithFancybox } from "@/utils/image";
import parseMarkdownToHtml from "@/utils/marked";

export default function TimelineItemFeed(props: TimelineComponent) {
  const { item, className = "", ...rest } = props;

  const innerHtml = useMemo(() => {
    return wrapImgWithFancybox(
      parseMarkdownToHtml(String(item.content)) as string,
      item.id,
    );
  }, [item.content, item.id]);

  return (
    <div className={`feed ${className}`} {...rest}>
      <article className="markdown-body max-w-none bg-background-light px-4 py-6 lg:px-6 lg:py-8">
        <h1>
          <a href={item.url} target="_blank">
            {item.title}
          </a>
        </h1>
        <div
          dangerouslySetInnerHTML={{
            __html: innerHtml,
          }}
        />
      </article>
    </div>
  );
}
