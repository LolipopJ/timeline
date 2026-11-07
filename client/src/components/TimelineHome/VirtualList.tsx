import type { Range, VirtualItem } from "@tanstack/react-virtual";
import {
  defaultRangeExtractor,
  useWindowVirtualizer,
} from "@tanstack/react-virtual";
import type { TimelineItemClient } from "@timeline/contracts";
import type { Ref, RefObject } from "react";
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";

import VirtualRow, {
  type RowHeight,
} from "@/components/TimelineHome/VirtualRow";
import type { TimelineItemProps } from "@/components/TimelineItem";
import TimelineItem from "@/components/TimelineItem";
import type { TimelineFilters } from "@/utils/timelineFilters";

type TimelineRow = {
  item: TimelineItemClient;
  month: string;
  startsYear: boolean;
  startsMonth: boolean;
};

export function getTimelineRows(
  pages: TimelineItemClient[][],
  orderBy: TimelineFilters["orderBy"],
) {
  const rows: TimelineRow[] = [];
  // Offset pages can overlap when synchronization inserts newer items.
  const seen = new Set<string>();
  for (const page of pages) {
    for (const item of page) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      const date = new Date(item[orderBy]);
      const year = date.getFullYear();
      const month = `${year}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const previousMonth = rows.at(-1)?.month;
      rows.push({
        item,
        month,
        startsYear: !previousMonth?.startsWith(`${year}-`),
        startsMonth: previousMonth !== month,
      });
    }
  }
  return rows;
}

const archiveTickClass =
  "relative before:absolute before:top-1/2 before:-left-(--archive-gutter) before:-translate-1/2";

export type TimelineVirtualListHandle = {
  scrollToTop: (behavior: "auto" | "smooth") => void;
};

export default function TimelineVirtualList({
  ref,
  rows,
  toolbarRef,
  onReadingMonthChange,
  filters,
  onFiltersChange,
  mutateTimelineItems,
}: Pick<
  TimelineItemProps,
  "filters" | "onFiltersChange" | "mutateTimelineItems"
> & {
  ref?: Ref<TimelineVirtualListHandle>;
  rows: TimelineRow[];
  toolbarRef: RefObject<HTMLDivElement | null>;
  onReadingMonthChange: (month: string) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const enteredItems = useRef(new Set<string>());
  const heightCache = useRef(new Map<string, RowHeight>());
  const [scrollMargin, setScrollMargin] = useState(0);
  const [focusedItem, setFocusedItem] = useState<string>();
  const [expandedItems, setExpandedItems] = useState(() => new Set<string>());
  const changeExpanded = useCallback((id: string, expanded: boolean) => {
    setExpandedItems((previous) => {
      const next = new Set(previous);
      if (expanded) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);
  const focusedIndex = useMemo(
    () => rows.findIndex(({ item }) => item.id === focusedItem),
    [rows, focusedItem],
  );
  const rangeExtractor = useCallback(
    (range: Range) => {
      const indexes = defaultRangeExtractor(range);
      // Keep the active control mounted when scrolling with focus inside a card.
      if (focusedIndex < 0 || indexes.includes(focusedIndex)) return indexes;
      return [...indexes, focusedIndex].sort((a, b) => a - b);
    },
    [focusedIndex],
  );
  const getItemKey = useCallback(
    (index: number) => rows[index].item.id,
    [rows],
  );
  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    getItemKey,
    estimateSize: () => 260,
    overscan: 5,
    rangeExtractor,
    scrollMargin,
  });
  useImperativeHandle(
    ref,
    () => ({
      scrollToTop: (behavior) => virtualizer.scrollToOffset(0, { behavior }),
    }),
    [virtualizer],
  );
  const measureRow = useCallback(
    (element: HTMLDivElement | null) => {
      virtualizer.measureElement(element);
      const id = element?.dataset.timelineRow;
      if (!element || !id || enteredItems.current.has(id)) return;
      enteredItems.current.add(id);
      element.firstElementChild?.setAttribute("data-timeline-enter", "");
    },
    [virtualizer],
  );

  useEffect(() => {
    const list = listRef.current;
    const toolbar = toolbarRef.current;
    if (!list || !toolbar) return;

    let frame = 0;
    const updateReadingMonth = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const { scrollHeight, scrollTop, clientHeight } =
          document.documentElement;
        const atEnd =
          scrollHeight > clientHeight &&
          scrollHeight - scrollTop - clientHeight <= 1;
        // The last month may be too short to reach the reading line.
        if (atEnd) {
          onReadingMonthChange(rows[rows.length - 1].month);
          return;
        }
        const readingLine = toolbar.getBoundingClientRect().bottom + 12;
        const cards = Array.from(
          list.querySelectorAll<HTMLElement>("[data-reading-month]"),
        );
        const card = cards.findLast(
          (entry) => entry.getBoundingClientRect().top <= readingLine,
        );
        onReadingMonthChange(
          (card ?? cards[0])?.dataset.readingMonth ?? rows[0].month,
        );
      });
    };
    const updateLayout = () => {
      setScrollMargin(
        Math.round(list.getBoundingClientRect().top + window.scrollY),
      );
      updateReadingMonth();
    };
    const resize = new ResizeObserver(updateLayout);
    resize.observe(list);
    resize.observe(toolbar);
    window.addEventListener("scroll", updateReadingMonth, { passive: true });
    window.addEventListener("resize", updateLayout);
    updateLayout();
    return () => {
      resize.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", updateReadingMonth);
      window.removeEventListener("resize", updateLayout);
    };
  }, [onReadingMonthChange, rows, toolbarRef]);

  const sections = new Map<string, Map<string, VirtualItem[]>>();
  for (const row of virtualizer.getVirtualItems()) {
    const [year, month] = rows[row.index].month.split("-");
    let months = sections.get(year);
    if (!months) {
      months = new Map();
      sections.set(year, months);
    }
    const items = months.get(month);
    if (items) items.push(row);
    else months.set(month, [row]);
  }

  return (
    <div
      ref={listRef}
      className="relative [overflow-anchor:none]"
      style={{ height: virtualizer.getTotalSize() }}
      onFocusCapture={({ target }) => {
        setFocusedItem(
          target.closest<HTMLElement>("[data-timeline-row]")?.dataset
            .timelineRow,
        );
      }}
      onBlurCapture={({ currentTarget, relatedTarget }) => {
        if (!currentTarget.contains(relatedTarget)) setFocusedItem(undefined);
      }}
    >
      {Array.from(sections, ([year, months]) => (
        <section key={year} aria-label={year}>
          {Array.from(months, ([month, virtualRows]) => (
            <section key={month} aria-label={`${month} 月`}>
              {virtualRows.map(({ index, key, start }) => {
                const row = rows[index];
                const expanded = expandedItems.has(row.item.id);
                return (
                  <VirtualRow
                    key={key}
                    id={row.item.id}
                    index={index}
                    top={start - scrollMargin}
                    layoutKey={JSON.stringify([
                      row.item.version,
                      row.item.updated_at,
                      row.item.is_secret,
                      row.startsYear,
                      row.startsMonth,
                      expanded,
                    ])}
                    heightCache={heightCache}
                    measureElement={measureRow}
                    className={row.startsYear && index > 0 ? "pt-12" : ""}
                  >
                    {row.startsYear && (
                      <h2
                        className={`${archiveTickClass} border-b border-binding pb-2 text-4xl font-semibold tracking-tight tabular-nums before:size-2.5 before:rotate-45 before:bg-foreground-dark sm:text-5xl`}
                      >
                        {year}
                      </h2>
                    )}
                    {row.startsMonth && (
                      <h3
                        className={`${archiveTickClass} mt-5 mb-3 text-base font-semibold text-foreground-dark tabular-nums before:h-px before:w-2 before:bg-control lg:text-lg`}
                      >
                        {month} 月
                      </h3>
                    )}
                    <TimelineItem
                      id={row.item.id}
                      item={row.item}
                      displayedDateTime={filters.orderBy}
                      mutateTimelineItems={mutateTimelineItems}
                      filters={filters}
                      onFiltersChange={onFiltersChange}
                      expanded={expanded}
                      onItemExpandedChange={changeExpanded}
                      data-reading-month={row.month}
                    />
                  </VirtualRow>
                );
              })}
            </section>
          ))}
        </section>
      ))}
    </div>
  );
}
