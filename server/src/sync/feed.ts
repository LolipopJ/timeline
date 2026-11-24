import axios from "axios";
import { xml2json } from "xml-js";

import { insertOrUpdateTimelineItems } from "../database/controller/timeline-item";
import type TimelineItem from "../database/entity/timeline-item";
import type { SyncServiceFeed, TimelineItemAttachment } from "../types/config";
import { createLogger, stripQuery } from "../utils/logger";

const logger = createLogger("Feed");

interface XmlTextNode {
  _text?: string;
  _cdata?: string;
}

interface AtomLinkNode {
  _attributes?: {
    href?: string;
    rel?: string;
  };
}

interface AtomEntryNode {
  title?: XmlTextNode;
  link?: AtomLinkNode | AtomLinkNode[];
  id?: XmlTextNode;
  published?: XmlTextNode;
  updated?: XmlTextNode;
  summary?: XmlTextNode;
}

interface AtomJson {
  feed?: {
    title?: XmlTextNode;
    updated?: XmlTextNode;
    id?: XmlTextNode;
    entry?: AtomEntryNode | AtomEntryNode[];
  };
}

interface RssEnclosureNode {
  _attributes?: {
    url?: string;
    length?: string;
    type?: string;
  };
}

interface RssItemNode {
  title?: XmlTextNode;
  description?: XmlTextNode;
  link?: XmlTextNode;
  guid?: XmlTextNode & {
    _attributes?: {
      isPermaLink?: string;
    };
  };
  category?: XmlTextNode | XmlTextNode[];
  pubDate?: XmlTextNode;
  enclosure?: RssEnclosureNode | RssEnclosureNode[];
  "atom:updated"?: XmlTextNode;
  "content:created-at"?: XmlTextNode;
  "content:updated-at"?: XmlTextNode;
  [key: string]: unknown;
}

interface RssJson {
  rss?: {
    channel?: {
      title?: XmlTextNode;
      description?: XmlTextNode;
      link?: XmlTextNode;
      generator?: XmlTextNode;
      lastBuildDate?: XmlTextNode;
      item?: RssItemNode | RssItemNode[];
    };
  };
}

const IMAGE_URL_EXTENSIONS = new Set([
  "avif",
  "bmp",
  "gif",
  "jpeg",
  "jpg",
  "png",
  "svg",
  "webp",
]);

const IMAGE_MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/bmp": "bmp",
  "image/svg+xml": "svg",
};

const toArray = <T>(value: T | T[] | undefined): T[] => {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
};

const getXmlText = (node?: XmlTextNode): string | undefined => {
  if (typeof node?._cdata === "string") return node._cdata;
  if (typeof node?._text === "string") return node._text;
  return undefined;
};

const parseOptionalDate = (value?: string): Date | undefined => {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

const extractRssCoverAttachment = (
  enclosure: RssItemNode["enclosure"],
  baseUrl?: string,
): TimelineItemAttachment | undefined => {
  for (const candidate of toArray(enclosure)) {
    const rawUrl = candidate._attributes?.url?.trim();
    if (!rawUrl) continue;

    const parsedUrl =
      URL.parse(rawUrl) ?? (baseUrl ? URL.parse(rawUrl, baseUrl) : null);
    if (
      !parsedUrl ||
      (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:")
    ) {
      continue;
    }

    const mimeType = candidate._attributes?.type
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase();
    const pathExt = parsedUrl.pathname
      .split("/")
      .pop()
      ?.match(/\.([a-z0-9]+)$/i)?.[1]
      ?.toLowerCase();
    const isImage = mimeType
      ? mimeType.startsWith("image/")
      : Boolean(pathExt && IMAGE_URL_EXTENSIONS.has(pathExt));
    if (!isImage) continue;

    const ext =
      (pathExt && IMAGE_URL_EXTENSIONS.has(pathExt) ? pathExt : undefined) ??
      (mimeType ? IMAGE_MIME_EXTENSIONS[mimeType] : undefined);

    return {
      filename: ext ? `cover.${ext}` : "cover",
      url: parsedUrl.href,
    };
  }
  return undefined;
};

const parseRssEntries = (
  feedJSON: unknown,
  service: Pick<SyncServiceFeed, "id" | "type" | "from" | "secret" | "url">,
  logUrl: string,
): TimelineItem[] => {
  const { id, type, from = new Date(0), secret, url } = service;
  const channel = (feedJSON as RssJson).rss?.channel;
  if (!channel) {
    throw new Error(
      `Parse feed \`${logUrl}\` failed: missing RSS channel. Check the \`syntax\` field and whether the URL returns an RSS feed.`,
    );
  }

  return toArray(channel.item)
    .flatMap((entry): TimelineItem[] => {
      const entryUrl = getXmlText(entry.link)?.trim() || null;
      const contentId = getXmlText(entry.guid)?.trim() || entryUrl;
      const pubDate = parseOptionalDate(getXmlText(entry.pubDate));
      const createdAt =
        parseOptionalDate(getXmlText(entry["content:created-at"])) ?? pubDate;

      if (!contentId || !createdAt) {
        logger.warn(
          `Skipped malformed RSS item from ${logUrl}: missing guid/link or valid pubDate.`,
        );
        return [];
      }

      const updatedAt =
        parseOptionalDate(getXmlText(entry["atom:updated"])) ??
        parseOptionalDate(getXmlText(entry["content:updated-at"])) ??
        pubDate ??
        createdAt;
      const cover = extractRssCoverAttachment(entry.enclosure, entryUrl ?? url);

      return [
        {
          sync_service_id: id,
          sync_service_type: type,
          content_id: contentId,
          title: getXmlText(entry.title) ?? null,
          content: getXmlText(entry.description) ?? null,
          url: entryUrl,
          attachments: cover ? [cover] : null,
          metadata: JSON.stringify(entry),
          is_secret: secret,
          created_at: createdAt,
          updated_at: updatedAt,
        } as TimelineItem,
      ];
    })
    .filter((entry) => entry.created_at >= from);
};

const parseAtomEntries = (
  feedJSON: unknown,
  service: Pick<SyncServiceFeed, "id" | "type" | "from" | "secret">,
  logUrl: string,
): TimelineItem[] => {
  const { id, type, from = new Date(0), secret } = service;
  const feed = (feedJSON as AtomJson).feed;
  if (!feed) {
    throw new Error(
      `Parse feed \`${logUrl}\` failed: missing Atom feed root. Check the \`syntax\` field and whether the URL returns an Atom feed.`,
    );
  }

  return toArray(feed.entry)
    .flatMap((entry): TimelineItem[] => {
      const links = toArray(entry.link);
      const entryUrl =
        (
          links.find(
            (link) =>
              link._attributes?.rel === "alternate" || !link._attributes?.rel,
          )?._attributes?.href ??
          links.find((link) => link._attributes?.href)?._attributes?.href
        )?.trim() || null;
      const contentId = getXmlText(entry.id)?.trim() || entryUrl;
      const publishedAt = parseOptionalDate(getXmlText(entry.published));
      const updatedAt = parseOptionalDate(getXmlText(entry.updated));
      const createdAt = publishedAt ?? updatedAt;

      if (!contentId || !createdAt) {
        logger.warn(
          `Skipped malformed Atom entry from ${logUrl}: missing id/link or valid timestamp.`,
        );
        return [];
      }

      return [
        {
          sync_service_id: id,
          sync_service_type: type,
          content_id: contentId,
          title: getXmlText(entry.title) ?? null,
          content: getXmlText(entry.summary) ?? null,
          url: entryUrl,
          metadata: JSON.stringify(entry),
          is_secret: secret,
          created_at: createdAt,
          updated_at: updatedAt ?? createdAt,
        } as TimelineItem,
      ];
    })
    .filter((entry) => entry.created_at >= from);
};

export const syncFeed = async (service: SyncServiceFeed) => {
  const { from = new Date(0), syntax = "atom", url } = service;
  const since = from.toISOString();
  // 私有 Feed 常把 token 放在 query 中，日志只记录不含查询串的地址
  const logUrl = stripQuery(url);

  logger.info(`Syncing feed entries from ${logUrl} since ${since}...`);
  let feedContent: string;
  try {
    const getFeedRes = await axios.get<string>(url, { responseType: "text" });
    feedContent = getFeedRes.data;
  } catch (error) {
    // 保留 cause，由日志层统一展开，不要在消息中重复格式化
    throw new Error(`Fetch feed \`${logUrl}\` failed.`, { cause: error });
  }

  let feedJSON: unknown;
  try {
    feedJSON = JSON.parse(xml2json(feedContent, { compact: true }));
  } catch (error) {
    throw new Error(
      `Parse feed \`${logUrl}\` failed: the response is not valid XML/JSON. Check the \`syntax\` field and whether the URL returns the expected feed.`,
      { cause: error },
    );
  }

  const entries =
    syntax === "rss"
      ? parseRssEntries(feedJSON, service, logUrl)
      : parseAtomEntries(feedJSON, service, logUrl);
  logger.info(`Synced ${entries.length} feed entries from ${logUrl}.`);

  const itemCount =
    entries.length > 0 ? await insertOrUpdateTimelineItems(entries) : 0;
  logger.success(
    `Insert or update ${itemCount} feed entries from ${logUrl} successfully!`,
  );
  return itemCount;
};
