import { mdiCloseThick, mdiCommentSearch } from "@mdi/js";
import Icon from "@mdi/react";
import React, { useEffect, useId, useRef, useState } from "react";

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
  serviceLabels: string[];
  searchKey: string;
  onChange: TimelineFiltersChange;
}

export default function TimelineSearch(props: TimelineSearchProps) {
  const {
    className = "",
    value,
    serviceLabels,
    searchKey,
    onChange,
    ...rest
  } = props;
  const [draft, setDraft] = useState({ key: searchKey, text: value.search });
  if (draft.key !== searchKey) {
    const parsed = parseTimelineSearch(draft.text, serviceLabels);
    setDraft({
      key: searchKey,
      text:
        !parsed.id && !parsed.serviceLabel && parsed.search === value.search
          ? draft.text
          : value.search,
    });
  }
  const draftSearch = draft.key === searchKey ? draft.text : value.search;
  const [open, setOpen] = useState<"sort" | "labels" | null>(null);
  const sortOpen = open === "sort";
  const labelsOpen = open === "labels" && serviceLabels.length > 0;
  const labelsId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sortRef = useRef<HTMLButtonElement>(null);
  const composing = useRef(false);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (e.target instanceof Node && !rootRef.current?.contains(e.target)) {
        setOpen(null);
      }
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [open]);

  function handleSelect(orderBy: TimelineFilters["orderBy"]) {
    setOpen(null);
    sortRef.current?.focus({ preventScroll: true });
    onChange({ ...filtersForInput(draftSearch), orderBy });
  }

  function selectLabel(serviceLabel: string) {
    inputRef.current?.focus({ preventScroll: true });
    setOpen(null);
    setDraft({ key: searchKey, text: "" });
    onChange({ search: "", serviceLabel, orderBy: value.orderBy });
  }

  function filtersForInput(text: string): TimelineFilters {
    if (text === value.search) return value;
    const parsed = parseTimelineSearch(text, serviceLabels);
    return {
      ...parsed,
      orderBy: value.orderBy,
      serviceLabel: parsed.id
        ? undefined
        : (parsed.serviceLabel ?? value.serviceLabel),
    };
  }

  function changeInput(text: string, confirm = false) {
    setOpen(null);
    const parsed = parseTimelineSearch(text, serviceLabels);
    const structured = Boolean(parsed.id || parsed.serviceLabel);
    const sourceStart = parsed.serviceLabel
      ? text.lastIndexOf(`type:${parsed.serviceLabel}`)
      : -1;
    const sourcePrefix =
      sourceStart < 0 ? undefined : text.slice(sourceStart + 5);
    const continuesSource =
      sourcePrefix !== undefined &&
      serviceLabels.some(
        (label) =>
          label.length > sourcePrefix.length && label.startsWith(sourcePrefix),
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
    : value.serviceLabel
      ? `类型: ${value.serviceLabel}`
      : undefined;

  return (
    <div
      ref={rootRef}
      className={`${className} relative`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(null);
      }}
      onKeyDown={(event) => {
        if (open && event.key === "Escape") {
          event.stopPropagation();
          const trigger = open === "sort" ? sortRef : inputRef;
          trigger.current?.focus({ preventScroll: true });
          setOpen(null);
        }
      }}
    >
      <div className="relative">
        <input
          ref={inputRef}
          value={draftSearch}
          onFocus={() => setOpen("labels")}
          onClick={() => setOpen("labels")}
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
            const parsed = parseTimelineSearch(text, serviceLabels);
            if (parsed.id || parsed.serviceLabel) {
              event.preventDefault();
              changeInput(text, true);
            }
          }}
          aria-label="搜索时间线"
          aria-controls={labelsOpen ? labelsId : undefined}
          placeholder="搜索"
          className="h-11 w-full rounded-md border border-control bg-background-lighter pr-8 pl-10 text-sm placeholder:text-foreground-dark"
          {...rest}
        />

        <button
          ref={sortRef}
          type="button"
          onClick={() => setOpen(sortOpen ? null : "sort")}
          aria-label="搜索排序"
          aria-expanded={sortOpen}
          className="absolute inset-y-px left-px grid w-9 cursor-pointer place-items-center rounded-l-md border-r border-control bg-background-light hover:bg-background-lighter"
        >
          <Icon path={mdiCommentSearch} className="size-5" aria-hidden="true" />
        </button>

        <div
          data-open={sortOpen}
          inert={!sortOpen}
          aria-hidden={!sortOpen}
          className={`absolute inset-e-0 z-50 mt-2 w-max rounded-md border border-control bg-background-light shadow-lg motion-safe:archive-disclosure lg:inset-s-0 ${sortOpen ? "" : "hidden"}`}
        >
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

        {draftSearch && (
          <button
            type="button"
            aria-label="清空搜索"
            onClick={() => {
              inputRef.current?.focus({ preventScroll: true });
              setOpen(null);
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
        {serviceLabels.length > 0 && (
          <ul
            id={labelsId}
            aria-label="按类型筛选"
            data-open={labelsOpen}
            inert={!labelsOpen}
            aria-hidden={!labelsOpen}
            className={`absolute inset-x-0 z-50 mt-2 max-h-64 overflow-y-auto rounded-md border border-control bg-background-light p-1 text-sm shadow-lg motion-safe:archive-disclosure ${labelsOpen ? "" : "hidden"}`}
          >
            {serviceLabels.map((label) => (
              <li key={label}>
                <button
                  type="button"
                  onClick={() => selectLabel(label)}
                  className="min-h-11 w-full cursor-pointer rounded-md px-3 py-2 text-left wrap-anywhere hover:bg-background-lighter focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
                >
                  {label}
                </button>
              </li>
            ))}
          </ul>
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
              setOpen(null);
              onChange({
                ...value,
                search: draftSearch,
                id: undefined,
                serviceLabel: undefined,
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
