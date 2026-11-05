import type { GetTimelineItemsParams } from "@timeline/contracts";
import { validate as isUuid } from "uuid";

export interface TimelineSearchConditions {
  search: string;
  id?: string;
  serviceId?: string;
}

export interface TimelineFilters extends TimelineSearchConditions {
  orderBy: NonNullable<GetTimelineItemsParams["orderBy"]>;
}

export type TimelineFiltersChange = (
  update: TimelineFilters | ((current: TimelineFilters) => TimelineFilters),
  mode?: "draft" | "debounce",
) => void;

export function parseTimelineSearch(
  text: string,
  serviceIds: readonly string[],
): TimelineSearchConditions {
  let conditions: TimelineSearchConditions = { search: "" };
  const sources = [...serviceIds].sort(
    (left, right) => right.length - left.length,
  );
  let consumedUntil = 0;
  for (const match of text.matchAll(/\S+/g)) {
    if (match.index < consumedUntil) continue;
    const token = match[0];
    const serviceId = token.startsWith("type:")
      ? sources.find((id) => {
          const start = match.index + 5;
          const end = start + id.length;
          return (
            text.startsWith(id, start) &&
            (end === text.length || /\s/.test(text[end]))
          );
        })
      : undefined;
    if (token.startsWith("id:") && isUuid(token.slice(3))) {
      conditions = { search: "", id: token.slice(3).toLowerCase() };
    } else if (serviceId !== undefined) {
      conditions = { ...conditions, id: undefined, serviceId };
      consumedUntil = match.index + 5 + serviceId.length;
    } else {
      conditions = {
        ...conditions,
        id: undefined,
        search: [conditions.search, token].filter(Boolean).join(" "),
      };
    }
  }
  return conditions;
}

export function serializeTimelineSearch(conditions: TimelineSearchConditions) {
  if (conditions.id) return `id:${conditions.id}`;
  return [
    conditions.search,
    conditions.serviceId ? `type:${conditions.serviceId}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function getTimelineRequestParams(
  filters: TimelineFilters,
): GetTimelineItemsParams {
  return {
    orderBy: filters.orderBy,
    ...(filters.id
      ? { id: filters.id }
      : {
          ...(filters.search ? { search: filters.search } : {}),
          ...(filters.serviceId ? { serviceId: filters.serviceId } : {}),
        }),
  };
}

export function areTimelineFiltersEqual(
  left: TimelineFilters,
  right: TimelineFilters,
) {
  return (
    left.orderBy === right.orderBy &&
    serializeTimelineSearch(left) === serializeTimelineSearch(right)
  );
}

export function getTimelineFilterUrl(
  pathname: string,
  filters: TimelineFilters,
) {
  const params = new URLSearchParams();
  const search = serializeTimelineSearch(filters);
  if (search) params.set("search", search);
  if (filters.orderBy !== "created_at") params.set("orderBy", filters.orderBy);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
