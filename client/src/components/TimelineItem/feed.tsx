import { useMemo } from "react";

import type { TimelineComponent } from "@/interfaces/timeline";
import parseMarkdownToReactNode from "@/utils/markdown";

export default function TimelineItemFeed(props: TimelineComponent) {
  const { item, className = "", ...rest } = props;

  const parsedNode = useMemo(() => {
    return parseMarkdownToReactNode(String(item.content), item.id);
  }, [item.content, item.id]);

  return (
    <div className={`feed ${className}`} {...rest}>
      <article className="markdown-body bg-background-light max-w-none px-4 py-6 lg:px-6 lg:py-8">
        <h1>
          <a href={item.url} target="_blank">
            {item.title}
          </a>
        </h1>
        <div>{parsedNode}</div>
      </article>
    </div>
  );
}
