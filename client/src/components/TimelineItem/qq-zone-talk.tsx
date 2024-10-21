import dynamic from "next/dynamic";

import { SERVER_STATIC_PREFIX } from "@/constants";
import type { TimelineComponent } from "@/interfaces/timeline";

const VideoPlayer = dynamic(() => import("@/components/VideoPlayer"));

const resolveQQZoneContent = (content: string) => {
  return content
    .replace(
      /\[em\](.*?)\[\/em\]/g,
      '<img alt="$1" src="http://qzonestyle.gtimg.cn/qzone/em/$1.gif" class="inline">',
    )
    .replace(/@{.*?,nick:(.*?),.*?}/g, "@$1");
};

const QQ_ZONE_VIDEO_EXTENSIONS = ["mp4", "m3u8"];

export default function TimelineItemQQZoneTalk(props: TimelineComponent) {
  const { item, className = "", ...rest } = props;

  return (
    <div className={`qq-zone-talk ${className}`} {...rest}>
      <article className="markdown-body px-4 py-6 lg:px-6 lg:py-8">
        <p
          dangerouslySetInnerHTML={{
            __html: resolveQQZoneContent(String(item.content)),
          }}
        />
        {item.attachments && (
          <>
            {item.attachments.map((attachment) => {
              const { filename, url, coverUrl } = attachment;

              const fileType = filename.split(".").pop() ?? "";
              if (QQ_ZONE_VIDEO_EXTENSIONS.includes(fileType)) {
                return (
                  <p key={filename}>
                    <VideoPlayer
                      id={filename}
                      options={{
                        sources: [
                          {
                            src: `${SERVER_STATIC_PREFIX}${url}`,
                            type:
                              fileType === "m3u8"
                                ? "application/x-mpegURL"
                                : `video/${fileType}`,
                          },
                        ],
                        controls: true,
                        poster: coverUrl,
                        preload: "none",
                      }}
                      className="w-full"
                    />
                  </p>
                );
              }

              return (
                <p key={filename}>
                  <a href={url} data-fancybox={`gallery-${item.id}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img alt={filename} src={url} />
                  </a>
                </p>
              );
            })}
          </>
        )}
      </article>
    </div>
  );
}
