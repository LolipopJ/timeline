"use client";

import { Fancybox } from "@fancyapps/ui";
import dynamic from "next/dynamic";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type Player from "video.js/dist/types/player";

const VideoPlayer = dynamic(() => import("@/components/VideoPlayer"));

export interface SlideshowItem {
  key: string;
  type: "image" | "video";
  src: string;
  fileType?: string;
  alt?: string;
}

export interface SlideshowProps extends Omit<
  React.HTMLAttributes<HTMLDivElement>,
  "onChange"
> {
  items: SlideshowItem[];
  autoPlay?: boolean;
  interval?: number;
  loop?: boolean;
  className?: string;
}

const EDGE_PEEK_PERCENTAGE = 8;
const GAP_PERCENTAGE = 2;
const SLIDE_WIDTH_PERCENTAGE = 100 - EDGE_PEEK_PERCENTAGE * 2;
const SLIDE_STEP_PERCENTAGE = SLIDE_WIDTH_PERCENTAGE + GAP_PERCENTAGE;

export default function Slideshow(props: SlideshowProps) {
  const {
    items,
    autoPlay = false,
    interval = 5000,
    loop = false,
    className = "",
    ...rest
  } = props;
  const count = items.length;

  const [index, setIndex] = useState(0);
  const indexRef = useRef(index);
  indexRef.current = index;
  const [hovered, setHovered] = useState(false);
  const playersRef = useRef(new Map<string, Player>());

  // fancybox 仅展示图片，不接入视频类型
  const imageIndexMap = useMemo(() => {
    const map = new Map<number, number>();
    items.forEach((item, i) => {
      if (item.type === "image") map.set(i, map.size);
    });
    return map;
  }, [items]);
  const fancyboxItems = useMemo(
    () =>
      items
        .filter((item) => item.type === "image")
        .map((item, index) => ({
          src: item.src,
          type: "image" as const,
          thumb: item.src,
          caption: item.alt ?? `Page ${index + 1}`,
        })),
    [items],
  );

  const canGoPrev = count > 1 && (loop || index > 0);
  const canGoNext = count > 1 && (loop || index < count - 1);

  const goTo = useCallback(
    (target: number) => {
      if (count === 0) return;
      setIndex(
        loop
          ? ((target % count) + count) % count
          : Math.min(Math.max(target, 0), count - 1),
      );
    },
    [count, loop],
  );

  const go = useCallback(
    (direction: 1 | -1) => {
      if (direction === 1 ? !canGoNext : !canGoPrev) return;
      goTo(index + direction);
    },
    [canGoNext, canGoPrev, goTo, index],
  );

  // 定时自动轮切
  useEffect(() => {
    if (!autoPlay || count <= 1) return;
    const timer = setInterval(() => go(1), interval);
    return () => clearInterval(timer);
  }, [autoPlay, interval, count, go]);

  const openFancybox = useCallback(
    (originalIndex: number) => {
      const startIndex = imageIndexMap.get(originalIndex);
      if (startIndex === undefined) return;

      // 打开前暂停所有背景视频
      playersRef.current.forEach((player) => {
        if (!player.isDisposed()) player.pause();
      });

      const imageOriginalIndices = items
        .map((item, i) => (item.type === "image" ? i : -1))
        .filter((i) => i !== -1);

      Fancybox.show(fancyboxItems, {
        startIndex,
        on: {
          "Carousel.change": (_fancybox, _carousel, currentSlide) => {
            const fancyIndex = currentSlide;
            const mappedOriginalIndex = imageOriginalIndices[fancyIndex];
            if (mappedOriginalIndex === undefined) return;
            if (mappedOriginalIndex !== indexRef.current) {
              setIndex(mappedOriginalIndex);
            }
          },
        },
      });
    },
    [fancyboxItems, imageIndexMap, items],
  );

  // 切换索引时暂停视频
  useEffect(() => {
    playersRef.current.forEach((player) => {
      if (!player.isDisposed()) player.pause();
    });
  }, [index]);

  if (count === 0) return null;

  const translate = EDGE_PEEK_PERCENTAGE - index * SLIDE_STEP_PERCENTAGE;

  return (
    <div
      className={`slideshow relative select-none overflow-hidden ${className}`}
      onMouseOver={() => setHovered(true)}
      onMouseOut={() => setHovered(false)}
      {...rest}
    >
      <div
        className="flex h-full items-center transition-transform duration-300 ease-out"
        style={{
          transform: `translateX(${translate}%)`,
          gap: `${GAP_PERCENTAGE}%`,
        }}
      >
        {items.map((item, i) => {
          const isCurrent = i === index;

          return (
            <div
              key={item.key}
              className={`relative h-full flex-shrink-0 ${
                isCurrent ? "cursor-zoom-in" : "cursor-pointer blur-[1px]"
              }`}
              style={{ flexBasis: `${SLIDE_WIDTH_PERCENTAGE}%` }}
              onClick={(e) => {
                // 如果点击的是 video.js 的控制栏或视频元素本身，不触发 Fancybox
                const target = e.target as HTMLElement;
                if (target.closest(".video-js") || target.tagName === "VIDEO") {
                  return;
                }

                if (isCurrent) {
                  if (item.type === "image") openFancybox(i);
                } else {
                  goTo(i);
                }
              }}
            >
              {item.type === "image" && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt={item.alt}
                  src={item.src}
                  className="pointer-events-none size-full select-none object-cover"
                  draggable={false}
                />
              )}
              {item.type === "video" && (
                <VideoPlayer
                  id={item.key}
                  options={{
                    sources: [{ src: item.src, type: item.fileType }],
                    controls: true,
                    poster: item.alt,
                    preload: "none",
                  }}
                  // 阻止 video.js 内部点击事件冒泡到外层 div，避免误触发导航
                  className={`size-full ${isCurrent ? "" : "pointer-events-none"}`}
                  onReady={(player) => {
                    playersRef.current.set(item.key, player);
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      {canGoPrev && (
        <button
          type="button"
          aria-label="上一张"
          onClick={(e) => {
            e.stopPropagation();
            go(-1);
          }}
          className={`absolute inset-y-0 left-0 z-10 w-[8%]`}
        />
      )}
      {canGoNext && (
        <button
          type="button"
          aria-label="下一张"
          onClick={(e) => {
            e.stopPropagation();
            go(1);
          }}
          className="absolute inset-y-0 right-0 z-10 w-[8%]"
        />
      )}

      {count > 1 && (
        <div
          className={`pointer-events-none absolute inset-x-0 bottom-1 z-10 flex justify-center gap-1.5 transition-opacity duration-300 ${
            hovered ? "opacity-100" : "opacity-0"
          }`}
        >
          {items.map((item, i) => (
            <button
              key={item.key}
              type="button"
              aria-label={`跳转到第 ${i + 1} 张`}
              onClick={(e) => {
                e.stopPropagation();
                goTo(i);
              }}
              className={`pointer-events-auto size-2 rounded-full transition ${
                i === index ? "bg-foreground-light" : "bg-foreground-dark"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
