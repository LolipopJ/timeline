import type { TimelineItemClient } from "../../../interfaces/api";

export interface TimelineComponent {
  item: TimelineItemClient;
  ["data-id"]: TimelineItemClient["id"];
  ["data-type"]: TimelineItemClient["sync_service_type"];
  ["data-label"]: TimelineItemClient["label"];
  className?: string;
}
