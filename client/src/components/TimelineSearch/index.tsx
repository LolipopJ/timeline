import { mdiCloseThick, mdiCommentSearch } from "@mdi/js";
import Icon from "@mdi/react";
import React, { useEffect, useRef, useState } from "react";

import type { GetTimelineItemsParams } from "../../../../interfaces/api";

type SearchParams = Pick<GetTimelineItemsParams, "search" | "orderBy">;

export interface TimelineSearchProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange"
> {
  onClear?: () => void;
  value?: SearchParams;
  onChange?: (v: SearchParams) => void;
}

export default function TimelineSearch(props: TimelineSearchProps) {
  const { className = "", value, onChange, onClear, ...rest } = props;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  function handleSelect(s: GetTimelineItemsParams["orderBy"]) {
    setOpen(false);
    onChange?.({ ...value, orderBy: s });
  }

  const current = value?.orderBy;

  return (
    <div ref={rootRef} className={`${className} relative`}>
      <input
        value={value?.search || ""}
        onChange={(e) => onChange?.({ ...value, search: e.target.value })}
        className={`h-8 w-full rounded-md bg-background-lighter pl-10`}
        {...rest}
      />

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="absolute left-0 top-0 size-8 rounded-md bg-background-light"
      >
        <Icon
          path={mdiCommentSearch}
          className="absolute left-1.5 top-1.5 size-5"
        />
      </button>

      {open && (
        <div className="absolute left-0 z-50 mt-2 w-fit rounded-md bg-background-light shadow-md shadow-background-lighter">
          <ul className="p-1">
            <li>
              <button
                type="button"
                onClick={() => handleSelect("created_at")}
                className={`w-full whitespace-nowrap rounded-md px-3 py-2 text-left hover:bg-background-lighter ${
                  current === "created_at" ? "font-medium underline" : ""
                }`}
              >
                按创建时间排序
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => handleSelect("updated_at")}
                className={`w-full whitespace-nowrap rounded-md px-3 py-2 text-left hover:bg-background-lighter ${
                  current === "updated_at" ? "font-medium underline" : ""
                }`}
              >
                按更新时间排序
              </button>
            </li>
          </ul>
        </div>
      )}

      {onClear && value?.search && (
        <span
          onClick={onClear}
          className="absolute -right-1 top-1 flex size-6 translate-x-full cursor-pointer items-center justify-center"
        >
          <Icon path={mdiCloseThick} className="size-4 text-foreground-dark" />
        </span>
      )}
    </div>
  );
}
