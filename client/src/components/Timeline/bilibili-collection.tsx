import type { TimelineComponent } from "@/interfaces/timeline";

export default function TimelineItemBilibiliCollection(
  props: TimelineComponent,
) {
  const { item, ...rest } = props;
  const cover = item.attachments?.[0];

  return (
    <div {...rest}>
      {cover && (
        <div className="relative">
          <a href={item.url} target="_blank">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt={`${cover.url}`}
              src={cover.url}
              referrerPolicy="no-referrer"
            />
          </a>
          <h1 className="image-intro top-0 font-bold sm:text-lg">
            <span className="line-clamp-1">{item.title}</span>
          </h1>
          <p className="image-intro bottom-0 hidden text-sm sm:block">
            <span className="line-clamp-4 md:line-clamp-5">{item.content}</span>
          </p>
        </div>
      )}
    </div>
  );
}
