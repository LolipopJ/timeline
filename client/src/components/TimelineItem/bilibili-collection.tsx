import type { TimelineComponent } from "@/interfaces/timeline";

const imageIntroClassName =
  "bg-black/70 text-white backdrop-blur-xs absolute px-4 py-3 inset-x-0 whitespace-pre-wrap";

export default function TimelineItemBilibiliCollection(
  props: TimelineComponent,
) {
  const { item, className = "", ...rest } = props;
  const cover = item.attachments?.[0];

  return (
    <div className={className} {...rest}>
      {cover && (
        <div className="relative aspect-video bg-background-light">
          <a
            href={item.url ?? undefined}
            target="_blank"
            className="select-none"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt={`${cover.url}`}
              src={cover.url}
              className="size-full object-cover"
            />
          </a>
          <h1
            className={`${imageIntroClassName} top-0 text-lg font-bold`}
            title={item.title ?? undefined}
          >
            <a
              href={item.url ?? undefined}
              target="_blank"
              className="line-clamp-1 hover:underline"
            >
              {item.title}
            </a>
          </h1>
          {item.content && (
            <p
              className={`${imageIntroClassName} bottom-0 hidden text-sm sm:block`}
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
