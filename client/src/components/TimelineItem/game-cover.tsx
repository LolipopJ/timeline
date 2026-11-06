import { mdiGamepadVariantOutline } from "@mdi/js";
import Icon from "@mdi/react";
import { useState } from "react";

export default function GameCover({
  src,
  portrait = false,
  className = "",
}: {
  src?: string;
  portrait?: boolean;
  className?: string;
}) {
  const [failedCover, setFailedCover] = useState<string>();

  return (
    <div
      className={`overflow-hidden rounded-sm bg-background-lighter ${portrait ? "aspect-2/3" : ""} ${className}`}
    >
      {src && failedCover !== src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          loading="lazy"
          className={`block size-full ${portrait ? "object-contain" : "object-cover"}`}
          onError={() => setFailedCover(src)}
        />
      ) : (
        <span
          role="img"
          aria-label="暂无游戏封面"
          className="flex size-full items-center justify-center text-foreground-dark"
        >
          <Icon
            path={mdiGamepadVariantOutline}
            className="size-8"
            aria-hidden="true"
          />
        </span>
      )}
    </div>
  );
}
