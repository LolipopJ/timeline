import { useMemo } from "react";

import Slideshow, { type SlideshowItem } from "@/components/Slideshow";
import { SERVER_STATIC_PREFIX } from "@/constants";
import type { TimelineComponent } from "@/interfaces/timeline";

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

  const slideshowItems: SlideshowItem[] = useMemo(() => {
    return (item.attachments ?? []).map((attachment) => {
      const { filename, url, coverUrl } = attachment;
      const fileType = filename.split(".").pop() ?? "";
      const isVideo = QQ_ZONE_VIDEO_EXTENSIONS.includes(fileType);
      return {
        key: filename,
        src: isVideo ? `${SERVER_STATIC_PREFIX}${url}` : url,
        type: isVideo ? "video" : "image",
        fileType: isVideo
          ? fileType === "m3u8"
            ? "application/x-mpegURL"
            : `video/${fileType}`
          : "",
        alt: isVideo ? coverUrl : undefined,
      };
    });
  }, [item.attachments]);

  return (
    <div className={`qq-zone-talk ${className}`} {...rest}>
      <article className="markdown-body px-4 py-6 lg:px-6 lg:py-8">
        <p
          dangerouslySetInnerHTML={{
            __html: resolveQQZoneContent(String(item.content)),
          }}
        />
        {item.attachments?.length && <Slideshow items={slideshowItems} />}
      </article>
    </div>
  );
}
