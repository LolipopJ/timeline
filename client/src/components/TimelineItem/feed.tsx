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
      <article className="markdown-body max-w-none bg-background-light px-4 py-6 lg:px-6 lg:py-8">
        <h1 className="text-lg">
          <a
            href={item.url ?? undefined}
            className="rounded-sm bg-[linear-gradient(var(--primary-dark),var(--primary-dark)),linear-gradient(var(--primary-dark),var(--primary-dark))] bg-size-[0%_100%,100%_0%] bg-bottom-left bg-no-repeat text-foreground transition-all duration-300 ease-out hover:bg-size-[100%_100%,100%_0%] hover:no-underline motion-reduce:transition-none"
            target="_blank"
          >
            {item.title}
          </a>
        </h1>
        <div>{parsedNode}</div>
      </article>
    </div>
  );
}
