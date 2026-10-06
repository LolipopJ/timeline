import parse from "html-react-parser";
import { Marked } from "marked";
import markedAlert from "marked-alert";
import dynamic from "next/dynamic";
import { v4 as uuid } from "uuid";

const VideoPlayer = dynamic(() => import("@/components/VideoPlayer"), {
  ssr: false,
});

const marked = new Marked();
marked.use(markedAlert());

const createVideoPlayer = (src: string, id: string) => {
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
      id={`video-${id}`}
      options={{
        sources: [{ src, type: videoType }],
        controls: true,
        crossOrigin: "anonymous",
      }}
      className="w-full"
    />
  );
};

const parseMarkdownToReactNode = (markdown: string, id?: string) => {
  const _id = id ?? uuid();
  const html = marked.parse(markdown) as string;

  return parse(html, {
    replace: (domNode) => {
      if (!("type" in domNode) || domNode.type !== "tag") return undefined;
      const { tagName, attribs } = domNode;

      if (tagName === "img") {
        const { src, alt } = attribs;
        return (
          <a href={src} data-fancybox={`gallery-${_id}`} data-caption={alt}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt="" {...attribs} loading="lazy" />
          </a>
        );
      }

      if (tagName === "video" && attribs.src) {
        return createVideoPlayer(attribs.src, _id);
      }

      return undefined;
    },
  });
};

export default parseMarkdownToReactNode;
