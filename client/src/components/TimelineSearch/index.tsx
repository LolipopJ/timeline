import { mdiCloseThick, mdiCommentSearch } from "@mdi/js";
import Icon from "@mdi/react";
import React, { useEffect, useRef, useState } from "react";

import {
  parseTimelineSearch,
  type TimelineFilters,
  type TimelineFiltersChange,
} from "@/utils/timelineFilters";

export interface TimelineSearchProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange"
> {
  value: TimelineFilters;
  serviceIds: string[];
  searchKey: string;
  onChange: TimelineFiltersChange;
}

export default function TimelineSearch(props: TimelineSearchProps) {
  const {
    className = "",
    value,
    serviceIds,
    searchKey,
    onChange,
    ...rest
  } = props;
  const [draft, setDraft] = useState({ key: searchKey, text: value.search });
  if (draft.key !== searchKey) {
    const parsed = parseTimelineSearch(draft.text, serviceIds);
    setDraft({
      key: searchKey,
      text:
        !parsed.id && !parsed.serviceId && parsed.search === value.search
          ? draft.text
          : value.search,
    });
  }
  const draftSearch = draft.key === searchKey ? draft.text : value.search;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sortRef = useRef<HTMLButtonElement>(null);
  const composing = useRef(false);

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

  function handleSelect(orderBy: TimelineFilters["orderBy"]) {
    setOpen(false);
    sortRef.current?.focus({ preventScroll: true });
    onChange({ ...filtersForInput(draftSearch), orderBy });
  }

  function filtersForInput(text: string): TimelineFilters {
    if (text === value.search) return value;
    const parsed = parseTimelineSearch(text, serviceIds);
    return {
      ...parsed,
      orderBy: value.orderBy,
      serviceId: parsed.id ? undefined : (parsed.serviceId ?? value.serviceId),
    };
  }

  function changeInput(text: string, confirm = false) {
    const parsed = parseTimelineSearch(text, serviceIds);
    const structured = Boolean(parsed.id || parsed.serviceId);
    const sourceStart = parsed.serviceId
      ? text.lastIndexOf(`type:${parsed.serviceId}`)
      : -1;
    const sourcePrefix =
      sourceStart < 0 ? undefined : text.slice(sourceStart + 5);
    const continuesSource =
      sourcePrefix !== undefined &&
      serviceIds.some(
        (id) => id.length > sourcePrefix.length && id.startsWith(sourcePrefix),
      );
    const confirmed =
      !composing.current && (confirm || (/\s$/.test(text) && !continuesSource));
    setDraft({
      key: searchKey,
      text: structured && confirmed ? parsed.search : text,
    });
    onChange(
      filtersForInput(text),
      composing.current || (structured && !confirmed)
        ? "draft"
        : structured || confirm
          ? undefined
          : "debounce",
    );
  }

  const current = value.orderBy;
  const condition = value.id
    ? `id:${value.id}`
    : value.serviceId
      ? `type:${value.serviceId}`
      : undefined;

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
      <div className="relative">
        <input
          ref={inputRef}
          value={draftSearch}
          onChange={(event) => {
            changeInput(event.target.value);
          }}
          onCompositionStart={() => {
            composing.current = true;
            onChange(filtersForInput(draftSearch), "draft");
          }}
          onCompositionEnd={(event) => {
            composing.current = false;
            changeInput(event.currentTarget.value);
          }}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !composing.current &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              changeInput(event.currentTarget.value, true);
            }
          }}
          onPaste={(event) => {
            if (composing.current) return;
            const input = event.currentTarget;
            const text =
              draftSearch.slice(0, input.selectionStart ?? 0) +
              event.clipboardData.getData("text") +
              draftSearch.slice(input.selectionEnd ?? draftSearch.length);
            const parsed = parseTimelineSearch(text, serviceIds);
            if (parsed.id || parsed.serviceId) {
              event.preventDefault();
              changeInput(text, true);
            }
          }}
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

        {draftSearch && (
          <button
            type="button"
            aria-label="清空搜索"
            onClick={() => {
              inputRef.current?.focus({ preventScroll: true });
              setDraft({ key: searchKey, text: "" });
              onChange({ ...value, search: "", id: undefined });
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
      {condition && (
        <div className="mt-1 flex min-w-0 flex-wrap gap-1">
          <button
            type="button"
            aria-label={`移除 ${condition}`}
            title={`移除 ${condition}`}
            onClick={() => {
              inputRef.current?.focus({ preventScroll: true });
              onChange({
                ...value,
                search: draftSearch,
                id: undefined,
                serviceId: undefined,
              });
            }}
            className="flex max-w-full min-w-0 cursor-pointer items-center gap-1 rounded-md border border-control bg-background-lighter px-2 py-1 text-left text-xs hover:bg-background-light"
          >
            <span className="min-w-0 break-all">{condition}</span>
            <Icon
              path={mdiCloseThick}
              className="size-3 shrink-0"
              aria-hidden="true"
            />
          </button>
        </div>
      )}
    </div>
  );
}
