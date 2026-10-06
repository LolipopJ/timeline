import type { TimelineItemClient } from "@timeline/contracts";

export interface TimelineComponent {
  item: TimelineItemClient;
  className?: string;
  [key: string]: unknown;
}
