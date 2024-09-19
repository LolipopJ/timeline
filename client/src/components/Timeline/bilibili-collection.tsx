import type { TimelineComponent } from "@/interfaces/timeline";

export default function TimelineItemBilibiliCollection(
  props: TimelineComponent,
) {
  const { item, className, ...rest } = props;
  const cover = item.attachments?.[0];

  return (
    <div className={`${className} bilibili-collection`} {...rest}>
      {cover && (
        <div className="relative">
          <a href={item.url} target="_blank">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt={`${cover.url}`} src={cover.url} />
          </a>
          <h1
            className="image-intro top-0 font-bold sm:text-lg"
            title={item.title}
          >
            <span className="line-clamp-1">{item.title}</span>
          </h1>
          {item.content && (
            <p
              className="image-intro bottom-0 hidden text-sm sm:block"
              title={item.content}
            >
              <span className="line-clamp-4 md:line-clamp-5">
                {item.content}
              </span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
