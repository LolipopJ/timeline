import parse from "html-react-parser";
import { Marked } from "marked";
import dynamic from "next/dynamic";
import { v4 as uuid } from "uuid";

const VideoPlayer = dynamic(() => import("@/components/VideoPlayer"));

const marked = new Marked();

const parseMarkdownToReactNode = (markdown: string, id?: string) => {
  const _id = id ?? uuid();
  const html = marked.parse(markdown) as string;
  return parse(html, {
    replace: (domNode) => {
      if (domNode.type === "tag") {
        if (domNode.tagName === "img") {
          const { src, alt } = domNode.attribs;
          return (
            <a href={src} data-fancybox={`gallery-${_id}`} data-caption={alt}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt="" {...domNode.attribs} loading="lazy" />
            </a>
          );
        }

        if (domNode.tagName === "video" && domNode.attribs.src) {
          const { src } = domNode.attribs;

          const srcType = (src.split(".").pop() ?? "").toLowerCase();
          let videoType = "video/mp4";
          if (["mp4", "webm", "ogg"].includes(srcType)) {
            videoType = `video/${srcType}`;
          } else if (srcType === "m3u8") {
            videoType = "application/x-mpegURL";
          } else if (srcType === "mpd") {
            videoType = "application/dash+xml";
          }

          return (
            <VideoPlayer
              id={`video-${_id}`}
              options={{
                sources: [{ src, type: videoType }],
                controls: true,
                crossOrigin: "anonymous",
              }}
              className="w-full"
            />
          );
        }
      }
    },
  });
};

export default parseMarkdownToReactNode;
