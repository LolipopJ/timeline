import type { TimelineComponent } from "@/interfaces/timeline";

const imageIntroClassName =
  "bg-neutral-950/60 backdrop-blur-sm absolute px-4 py-3 inset-x-0 whitespace-pre-wrap";

export default function TimelineItemBilibiliCollection(
  props: TimelineComponent,
) {
  const { item, className = "", ...rest } = props;
  const cover = item.attachments?.[0];

  return (
    <div className={`bilibili-collection ${className}`} {...rest}>
      {cover && (
        <div className="relative">
          <a href={item.url} target="_blank" className="select-none">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt={`${cover.url}`} src={cover.url} />
          </a>
          <h1
            className={`${imageIntroClassName} image-intro top-0 font-bold sm:text-lg`}
            title={item.title}
          >
            <a
              href={item.url}
              target="_blank"
              className="hover:text-primary line-clamp-1 transition"
            >
              {item.title}
            </a>
          </h1>
          {item.content && (
            <p
              className={`${imageIntroClassName} image-intro bottom-0 hidden text-sm sm:block`}
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
