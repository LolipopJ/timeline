import type { TimelineComponent } from "@/interfaces/timeline";
import parseMarkdownToHtml from "@/utils/marked";

export default function TimelineItemGithubIssueComment(
  props: TimelineComponent,
) {
  const { item, className = "", ...rest } = props;

  return (
    <div className={`github-issue-comment ${className}`} {...rest}>
      <article
        className="markdown-body px-6 py-8"
        dangerouslySetInnerHTML={{
          __html: parseMarkdownToHtml(String(item.content)),
        }}
      />
    </div>
  );
}
