import type { TimelineComponent } from "@/interfaces/timeline";
import parseMarkdownToHtml from "@/utils/marked";

export default function TimelineItemFeed(props: TimelineComponent) {
  const { item, className = "", ...rest } = props;

  return (
    <div className={`feed ${className}`} {...rest}>
      <article className="heti bg-background-light max-w-none px-6">
        <a href={item.url} target="_blank">
          <h1>{item.title}</h1>
        </a>
        <div
          dangerouslySetInnerHTML={{
            __html: parseMarkdownToHtml(String(item.content)),
          }}
        />
      </article>
    </div>
  );
}
