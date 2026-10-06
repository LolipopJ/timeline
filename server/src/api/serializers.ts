import type {
  TimelineItemAttachmentDto,
  TimelineItemClient,
} from "@timeline/contracts";

import type TimelineItem from "../database/entity/timeline-item";
import type { TimelineItemAttachment } from "../types/config";

// JSON attachment columns return strings after a database round trip.
const toIsoString = (value: Date | string) => new Date(value).toISOString();

const serializeAttachment = (
  attachment: TimelineItemAttachment,
): TimelineItemAttachmentDto => ({
  filename: attachment.filename,
  url: attachment.url,
  coverUrl: attachment.coverUrl,
  created_at:
    attachment.created_at == null
      ? undefined
      : toIsoString(attachment.created_at),
  updated_at:
    attachment.updated_at == null
      ? undefined
      : toIsoString(attachment.updated_at),
});

export const serializeTimelineItem = (
  item: TimelineItem,
  label?: string,
): TimelineItemClient => {
  if (!item.id)
    throw new Error("Cannot serialize an unpersisted timeline item");

  return {
    id: item.id,
    sync_service_id: item.sync_service_id,
    sync_service_type: item.sync_service_type,
    content_id: item.content_id,
    label,
    title: item.title,
    content: item.content,
    url: item.url,
    attachments:
      item.attachments == null
        ? item.attachments
        : item.attachments.map(serializeAttachment),
    version: item.version,
    created_at: toIsoString(item.created_at),
    updated_at: toIsoString(item.updated_at),
    is_secret: item.is_secret,
  };
};
