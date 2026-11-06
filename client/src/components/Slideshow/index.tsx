"use client";

import { Fancybox } from "@fancyapps/ui";
import { mdiChevronLeft, mdiChevronRight } from "@mdi/js";
import Icon from "@mdi/react";
import dynamic from "next/dynamic";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type Player from "video.js/dist/types/player";

const VideoPlayer = dynamic(() => import("@/components/VideoPlayer"), {
  ssr: false,
});

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
  useEffect(() => {
    indexRef.current = index;
  }, [index]);
  const swipeStart = useRef<{ x: number; y: number; pointerId: number } | null>(
    null,
  );
  const swiped = useRef(false);
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

  function startSwipe(event: React.PointerEvent<HTMLDivElement>) {
    if (!event.isPrimary) return;
    swiped.current = false;
    if (
      event.pointerType !== "touch" ||
      (event.target instanceof Element &&
        event.target.closest(".vjs-control-bar"))
    )
      return;

    swipeStart.current = {
      x: event.clientX,
      y: event.clientY,
      pointerId: event.pointerId,
    };
  }

  function finishSwipe(event: React.PointerEvent<HTMLDivElement>) {
    const start = swipeStart.current;
    if (start?.pointerId !== event.pointerId) return;
    swipeStart.current = null;

    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
      swiped.current = true;
      go(dx < 0 ? 1 : -1);
    }
  }

  if (count === 0) return null;

  const translate = EDGE_PEEK_PERCENTAGE - index * SLIDE_STEP_PERCENTAGE;

  return (
    <div className={`slideshow select-none ${className}`} {...rest}>
      <div className="relative overflow-hidden rounded-sm">
        <div
          className="flex h-full touch-pan-y touch-pinch-zoom items-center motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out"
          onPointerDown={startSwipe}
          onPointerUp={finishSwipe}
          onPointerCancel={() => {
            swipeStart.current = null;
          }}
          onClickCapture={(event) => {
            if (swiped.current && event.detail > 0) {
              event.preventDefault();
              event.stopPropagation();
            }
          }}
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
                className={`relative h-full shrink-0 ${isCurrent ? "" : "cursor-pointer blur-[1px]"}`}
                style={{ flexBasis: `${SLIDE_WIDTH_PERCENTAGE}%` }}
                onClick={() => {
                  if (!isCurrent && item.type === "video") goTo(i);
                }}
              >
                {item.type === "image" ? (
                  <button
                    type="button"
                    tabIndex={isCurrent ? 0 : -1}
                    aria-label={`查看第 ${i + 1} 张图片`}
                    onClick={() => (isCurrent ? openFancybox(i) : goTo(i))}
                    className={`block size-full focus-visible:-outline-offset-2 ${isCurrent ? "cursor-zoom-in" : "cursor-pointer"}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      alt={item.alt ?? ""}
                      src={item.src}
                      className="pointer-events-none size-full object-cover"
                      draggable={false}
                    />
                  </button>
                ) : (
                  <VideoPlayer
                    id={item.key}
                    options={{
                      sources: [{ src: item.src, type: item.fileType }],
                      controls: true,
                      poster: item.alt,
                      preload: "none",
                    }}
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
            onClick={() => go(-1)}
            className="absolute inset-y-0 left-0 z-10 grid w-[8%] cursor-pointer place-items-center bg-linear-to-r from-black/65 to-transparent text-white focus-visible:-outline-offset-2"
          >
            <Icon path={mdiChevronLeft} className="size-5" aria-hidden="true" />
          </button>
        )}
        {canGoNext && (
          <button
            type="button"
            aria-label="下一张"
            onClick={() => go(1)}
            className="absolute inset-y-0 right-0 z-10 grid w-[8%] cursor-pointer place-items-center bg-linear-to-l from-black/65 to-transparent text-white focus-visible:-outline-offset-2"
          >
            <Icon
              path={mdiChevronRight}
              className="size-5"
              aria-hidden="true"
            />
          </button>
        )}
      </div>

      {count > 1 && (
        <div className="flex flex-wrap justify-center gap-0.5 pt-1">
          {items.map((item, i) => (
            <button
              key={item.key}
              type="button"
              aria-label={`跳转到第 ${i + 1} 张`}
              aria-current={i === index ? "true" : undefined}
              onClick={() => goTo(i)}
              className="grid size-8 cursor-pointer place-items-center rounded-full hover:bg-background-lighter"
            >
              <span
                aria-hidden="true"
                className={`size-2 rounded-full ${i === index ? "bg-primary" : "bg-control"}`}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
