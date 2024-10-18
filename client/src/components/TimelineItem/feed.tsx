import type { TimelineComponent } from "@/interfaces/timeline";
import parseMarkdownToHtml from "@/utils/marked";

export default function TimelineItemFeed(props: TimelineComponent) {
  const { item, className = "", ...rest } = props;

  return (
    <div className={`feed ${className}`} {...rest}>
      <article className="markdown-body bg-background-light max-w-none px-4 py-6 lg:px-6 lg:py-8">
        <h1>
          <a href={item.url} target="_blank">
            {item.title}
          </a>
        </h1>
        <div
          dangerouslySetInnerHTML={{
            __html: parseMarkdownToHtml(String(item.content)),
          }}
        />
      </article>
    </div>
  );
}
