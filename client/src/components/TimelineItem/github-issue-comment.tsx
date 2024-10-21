import { useMemo } from "react";

import type { TimelineComponent } from "@/interfaces/timeline";
import { wrapImgWithFancybox } from "@/utils/image";
import parseMarkdownToHtml from "@/utils/marked";

export default function TimelineItemGithubIssueComment(
  props: TimelineComponent,
) {
  const { item, className = "", ...rest } = props;

  const innerHtml = useMemo(() => {
    return wrapImgWithFancybox(
      parseMarkdownToHtml(String(item.content)) as string,
      item.id,
    );
  }, [item.content, item.id]);

  return (
    <div className={`github-issue-comment ${className}`} {...rest}>
      <article
        className="markdown-body px-4 py-6 lg:px-6 lg:py-8"
        dangerouslySetInnerHTML={{
          __html: innerHtml,
        }}
      />
    </div>
  );
}
