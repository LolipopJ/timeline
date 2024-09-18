import type { TimelineComponent } from "@/interfaces/timeline";
import parseMarkdownToHtml from "@/utils/marked";

export default function TimelineItemGithubIssueComment(
  props: TimelineComponent,
) {
  const { item, ...rest } = props;

  return (
    <div {...rest}>
      <div
        className="markdown-body p-4"
        dangerouslySetInnerHTML={{
          __html: parseMarkdownToHtml(String(item.content)),
        }}
      />
    </div>
  );
}
