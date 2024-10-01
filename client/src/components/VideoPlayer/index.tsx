import { useEffect, useRef } from "react";
import videojs from "video.js";
import Player from "video.js/dist/types/player";

export interface VideoPlayerProps {
  id: string;
  options: {
    sources: { src: string; type?: string }[];
    controls?: boolean;
    poster?: string;
    preload?: "auto" | "metadata" | "none";
    [key: string]: unknown;
  };
  className?: string;
  onReady?: (player: Player) => void;
}

/** https://videojs.com/guides/react/ */
export const VideoPlayer = (props: VideoPlayerProps) => {
  const { id, options, className = "", onReady } = props;

  const videoRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<Player>(null);

  useEffect(() => {
    if (!videoRef.current) return;

    if (!playerRef.current) {
      const videoElement = document.createElement("video-js");

      videoElement.classList.add("vjs-default-skin", "vjs-big-play-centered");
      videoElement.dataset.setup = '{"fluid": true}';
      videoRef.current.appendChild(videoElement);

      // @ts-expect-error: playerRef is writable
      const player = (playerRef.current = videojs(videoElement, options, () => {
        videojs.log(`Video player for ${id} is ready.`);
        onReady?.(player);
      }));
    }
  }, [id, onReady, options, videoRef]);

  // Dispose the Video.js player when the functional component unmounts
  useEffect(() => {
    const player = playerRef.current;

    return () => {
      if (player && !player.isDisposed()) {
        player.dispose();
        // @ts-expect-error: playerRef is writable
        playerRef.current = null;
        videojs.log(`Video player for ${id} is disposed.`);
      }
    };
  }, [id, playerRef]);

  // 离开视野后自动暂停播放
  useEffect(() => {
    const video = videoRef.current;
    const player = playerRef.current;

    if (video && player) {
      const pauseObserver = new IntersectionObserver(([entry]) => {
        if (!entry.isIntersecting) {
          player.pause();
        }
      });
      pauseObserver.observe(video);
      return () => {
        pauseObserver.unobserve(video);
      };
    }
  }, [videoRef, playerRef]);

  return <div data-vjs-player ref={videoRef} className={className} />;
};

export default VideoPlayer;
