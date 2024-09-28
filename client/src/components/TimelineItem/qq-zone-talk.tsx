import { useEffect } from "react";
import videojs from "video.js";

import type { TimelineComponent } from "@/interfaces/timeline";

export default function TimelineItemQQZoneTalk(props: TimelineComponent) {
  const { item, className = "", ...rest } = props;

  useEffect(() => {
    const { attachments } = item;

    attachments?.forEach(({ url }) => {
      if (url.endsWith(".m3u8")) {
        const videoElement = document.getElementById(url);
        if (videoElement) videojs(videoElement);
      }
    });
  }, [item]);

  return (
    <div className={`qq-zone-talk ${className}`} {...rest}>
      <article className="markdown-body px-6 py-8">
        <div>{item.content}</div>
        {item.attachments && (
          <div>
            {item.attachments.map((attachment) => {
              const { filename, url } = attachment;

              if (url.endsWith(".m3u8")) {
                console.log(url);
                return (
                  <video
                    key={url}
                    id={url}
                    className="video-js"
                    controls
                    preload="auto"
                  >
                    <source src={url} type="video/m3u8" />
                  </video>
                );
              }

              return (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={url} alt={filename} src={url} />
              );
            })}
          </div>
        )}
      </article>
    </div>
  );
}
