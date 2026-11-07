import {
  mdiOpenInNew,
  // mdiSwordCross,
} from "@mdi/js";
import Icon from "@mdi/react";
import Image from "next/image";

import type { TimelineComponent } from "@/interfaces/timeline";

const raids = new Map([
  [
    "1993",
    { name: "巴哈姆特绝境战", abbreviation: "UCoB", position: "object-center" },
  ],
  [
    "2107",
    { name: "究极神兵绝境战", abbreviation: "UWU", position: "object-top" },
  ],
  [
    "2444",
    { name: "亚历山大绝境战", abbreviation: "TEA", position: "object-left" },
  ],
  [
    "3074",
    {
      name: "幻想龙诗绝境战",
      abbreviation: "DSR",
      position: "object-[center_35%]",
    },
  ],
  [
    "3162",
    { name: "欧米茄绝境验证战", abbreviation: "TOP", position: "object-top" },
  ],
  [
    "3617",
    { name: "光暗未来绝境战", abbreviation: "FRU", position: "object-top" },
  ],
  [
    "4069",
    { name: "妖星乱舞绝境战", abbreviation: "DMU", position: "object-top" },
  ],
]);

export default function TimelineItemFfxivUltimate({
  item,
  className = "",
  ...rest
}: TimelineComponent) {
  const [, achievementId] = item.content_id.split(":");
  const raid = raids.get(achievementId);
  if (!raid) return null;

  return (
    <article className="group/ultimate" {...rest}>
      <a
        href={item.url ?? undefined}
        target="_blank"
        rel="noreferrer"
        className={`relative isolate block overflow-hidden rounded-lg bg-stone-950 text-stone-100 shadow-md outline-offset-4 focus-visible:outline-amber-200 paper:focus-visible:outline-primary ${className}`}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
        >
          <Image
            src={`/ffxiv-ultimate/${achievementId}.webp`}
            alt=""
            fill
            unoptimized
            sizes="(max-width: 640px) 100vw, 720px"
            className={`object-cover ${raid.position}`}
          />
          <span className="absolute inset-0 bg-linear-to-r from-stone-950/95 via-stone-950/75 via-45% to-stone-950/10" />
          <span className="absolute inset-0 bg-linear-to-t from-stone-950/90 via-transparent to-stone-950/20" />
          <span className="absolute inset-0 bg-[repeating-linear-gradient(135deg,#fef3c7_0_0.5px,transparent_0.5px_5px)] mask-[linear-gradient(90deg,black,transparent_75%)] opacity-7" />
          <span className="absolute inset-0 -translate-x-full bg-linear-[110deg,transparent_35%,#fef3c7_50%,transparent_65%] opacity-10 motion-safe:transition-transform motion-safe:duration-1000 motion-safe:group-focus-within/ultimate:translate-x-full motion-safe:group-hover/ultimate:translate-x-full" />
          <span className="absolute inset-2 rounded-sm border border-amber-100/15" />
        </div>

        <div className="relative p-5 sm:px-7 sm:py-6">
          <div className="flex items-center justify-between gap-3">
            <span
              lang="en"
              className="text-[0.625rem] font-medium tracking-[0.18em] text-amber-100/90"
            >
              FINAL FANTASY XIV
            </span>
            <span
              lang="en"
              className="shrink-0 rounded-sm bg-stone-950/60 px-2 py-1 font-mono text-[0.625rem] tracking-wider text-stone-200"
            >
              {raid.abbreviation}
            </span>
          </div>

          <div className="mt-7 mb-2 flex items-center gap-1.5 text-xs font-medium tracking-widest text-amber-200 sm:mt-8">
            {/* <Icon path={mdiSwordCross} className="size-4" aria-hidden="true" /> */}
            绝境战踏破
          </div>
          <h2 className="font-serif text-2xl leading-snug font-semibold text-balance sm:text-3xl">
            {raid.name}
          </h2>
          <p
            lang="ja"
            className="mt-2 text-xs leading-relaxed text-stone-200 sm:text-sm"
          >
            {item.title}
          </p>

          <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-4 border-t border-amber-100/20 pt-4">
            <div className="min-w-0">
              <dt className="text-[0.625rem] tracking-widest text-stone-300">
                获得称号
              </dt>
              <dd
                lang="en"
                className="mt-1 font-serif text-base font-medium wrap-anywhere text-amber-100 sm:text-lg"
              >
                {item.content}
              </dd>
            </div>
            <div>
              <dt className="text-[0.625rem] tracking-widest text-stone-300">
                踏破时间
              </dt>
              <dd className="mt-1 font-mono text-xs leading-7 tabular-nums">
                <time dateTime={item.created_at}>
                  {new Date(item.created_at).toLocaleString("zh-CN", {
                    dateStyle: "medium",
                    timeStyle: "short",
                    hour12: false,
                  })}
                </time>
              </dd>
            </div>
          </dl>

          <div className="mt-4 flex items-center justify-between gap-3 text-[0.625rem] text-stone-300">
            <span>© SQUARE ENIX</span>
            <span className="flex items-center gap-1 text-amber-100">
              Lodestone
              <Icon path={mdiOpenInNew} className="size-3" aria-hidden="true" />
              <span className="sr-only">在新标签页查看成就详情</span>
            </span>
          </div>
        </div>
      </a>
    </article>
  );
}
