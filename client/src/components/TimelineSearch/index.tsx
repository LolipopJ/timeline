import { mdiCloseThick, mdiCommentSearch } from "@mdi/js";
import Icon from "@mdi/react";
import type { GetTimelineItemsParams } from "@timeline/contracts";
import React, { useEffect, useRef, useState } from "react";

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
  const inputRef = useRef<HTMLInputElement>(null);
  const sortRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (e.target instanceof Node && !rootRef.current?.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [open]);

  function handleSelect(s: GetTimelineItemsParams["orderBy"]) {
    setOpen(false);
    sortRef.current?.focus({ preventScroll: true });
    onChange?.({ ...value, orderBy: s });
  }

  const current = value?.orderBy;

  return (
    <div
      ref={rootRef}
      className={`${className} relative`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (open && event.key === "Escape") {
          event.stopPropagation();
          setOpen(false);
          sortRef.current?.focus({ preventScroll: true });
        }
      }}
    >
      <input
        ref={inputRef}
        value={value?.search || ""}
        onChange={(e) => onChange?.({ ...value, search: e.target.value })}
        aria-label="搜索时间线"
        placeholder="搜索"
        className="h-11 w-full rounded-md border border-control bg-background-lighter pr-8 pl-10 text-sm placeholder:text-foreground-dark"
        {...rest}
      />

      <button
        ref={sortRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="搜索排序"
        aria-expanded={open}
        className="absolute inset-y-px left-px grid w-9 cursor-pointer place-items-center rounded-l-md border-r border-control bg-background-light hover:bg-background-lighter"
      >
        <Icon path={mdiCommentSearch} className="size-5" aria-hidden="true" />
      </button>

      {open && (
        <div className="absolute inset-e-0 z-50 mt-2 w-max rounded-md border border-control bg-background-light shadow-lg lg:inset-s-0">
          <ul className="p-1">
            <li>
              <button
                type="button"
                onClick={() => handleSelect("created_at")}
                className={`w-full cursor-pointer rounded-md px-3 py-2 text-left whitespace-nowrap hover:bg-background-lighter ${
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
                className={`w-full cursor-pointer rounded-md px-3 py-2 text-left whitespace-nowrap hover:bg-background-lighter ${
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
        <button
          type="button"
          aria-label="清空搜索"
          onClick={() => {
            inputRef.current?.focus({ preventScroll: true });
            onClear();
          }}
          className="absolute inset-y-1 right-1 grid w-7 cursor-pointer place-items-center rounded-sm"
        >
          <Icon
            path={mdiCloseThick}
            className="size-4 text-foreground-dark"
            aria-hidden="true"
          />
        </button>
      )}
    </div>
  );
}
