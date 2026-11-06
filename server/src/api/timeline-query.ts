import type {
  CountTimelineItemsParams,
  TimelineView,
} from "@timeline/contracts";
import type { FindOptionsWhere } from "typeorm";
import { ILike, In } from "typeorm";

import config from "../config";
import type TimelineItem from "../database/entity/timeline-item";

const configuredLabels = new Map(
  config.services.map(({ id, label }) => [id, label?.trim() || id]),
);

export const getTimelineServiceLabel = (id: string) =>
  configuredLabels.get(id) ?? id;

export const getTimelineServiceLabels = (ids: string[]) => [
  ...new Set([
    ...configuredLabels.values(),
    ...ids.map(getTimelineServiceLabel),
  ]),
];

const getServiceIdsForLabel = (label: string) => {
  // Stored items whose source is absent from the config display its ID.
  const ids = configuredLabels.has(label) ? [] : [label];
  for (const [id, name] of configuredLabels) {
    if (name === label) ids.push(id);
  }
  return ids;
};

export const isTimelineServiceLabel = (
  label: unknown,
): label is string | undefined =>
  label === undefined || typeof label === "string";

export const isTimelineView = (
  view: unknown,
): view is TimelineView | undefined =>
  view === undefined || view === "public" || view === "admin";

export const isTimelineItemId = (id: unknown): id is string | undefined =>
  id === undefined ||
  (typeof id === "string" &&
    /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id));

export const getTimelineWhere = (
  { id, serviceLabel, serviceType, search, view }: CountTimelineItemsParams,
  isAdmin: boolean,
): FindOptionsWhere<TimelineItem> | FindOptionsWhere<TimelineItem>[] => {
  const base = {
    achievement_merged: false,
    ...(id === undefined ? {} : { id }),
    ...(serviceLabel === undefined
      ? {}
      : { sync_service_id: In(getServiceIdsForLabel(serviceLabel)) }),
    ...(serviceType === undefined ? {} : { sync_service_type: serviceType }),
    ...(isAdmin && view !== "public" ? {} : { is_secret: false }),
  };
  return search
    ? [
        { ...base, title: ILike(`%${search}%`) },
        { ...base, content: ILike(`%${search}%`) },
      ]
    : base;
};
