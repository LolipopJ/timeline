import { useMemo } from "react";

import type { TimelineComponent } from "@/interfaces/timeline";
import parseMarkdownToReactNode from "@/utils/markdown";

export default function TimelineItemGithubIssueComment(
  props: TimelineComponent,
) {
  const { item, className = "", ...rest } = props;

  const parsedNode = useMemo(() => {
    return parseMarkdownToReactNode(String(item.content), item.id);
  }, [item.content, item.id]);

  return (
    <div className={`github-issue-comment ${className}`} {...rest}>
      <article className="markdown-body px-4 py-6 lg:px-6 lg:py-8">
        {parsedNode}
      </article>
    </div>
  );
}
