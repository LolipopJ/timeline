import axios from "axios";
import { xml2json } from "xml-js";

import { insertOrUpdateTimelineItems } from "../database/controller/timeline-item";
import type TimelineItem from "../database/entity/timeline-item";
import type { SyncServiceFeed } from "../types/config";
import { createLogger, stripQuery } from "../utils/logger";

const logger = createLogger("Feed");

interface AtomJSON {
  feed: {
    title: {
      _text: string;
    };
    updated: {
      _text: string;
    };
    id: {
      _text: string;
    };
    author: {
      name: {
        _text: string;
      };
    };
    entry: {
      title: {
        _text: string;
      };
      link: {
        _attributes: {
          href: string;
        };
      };
      id: {
        _text: string;
      };
      published: {
        _text: string;
      };
      updated: {
        _text: string;
      };
      summary: {
        _text: string;
      };
    }[];
  };
}

interface RssJson {
  rss: {
    channel: {
      title: { _cdata: string };
      description: { _cdata: string };
      link: { _text: string };
      generator: { _text: string };
      lastBuildDate: { _text: string };
      item: ({
        title: { _cdata: string };
        description: { _cdata: string };
        link: { _text: string };
        guid: { _attributes: { _isPermaLink: string }; _text: string };
        category: { _cdata: string };
        pubDate: { _text: string };
      } & {
        [key: string]: {
          _text: string;
        };
      })[];
    };
  };
}

export const syncFeed = async (service: SyncServiceFeed) => {
  const {
    id,
    type,
    from = new Date(0),
    secret,
    syntax = "atom",
    url,
  } = service;
  const since = from.toISOString();
  // 私有 Feed 常把 token 放在 query 中，日志只记录不含查询串的地址
  const logUrl = stripQuery(url);

  logger.info(`Syncing feed entries from ${logUrl} since ${since}...`);
  let feedContent: string;
  try {
    const getFeedRes = await axios.get(url);
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
  let entries: TimelineItem[] = [];
  switch (syntax) {
    case "rss":
      entries = (feedJSON as RssJson).rss.channel.item.map((entry) => ({
        sync_service_id: id,
        sync_service_type: type,
        content_id: entry.guid._text,
        title: entry.title._cdata,
        content: entry.description._cdata,
        url: entry.link._text,
        metadata: JSON.stringify(entry),
        is_secret: secret,
        created_at: new Date(
          entry["content:created-at"]?._text ?? entry.pubDate._text,
        ),
        updated_at: new Date(
          entry["content:updated-at"]?._text ?? entry.pubDate._text,
        ),
      }));
      break;
    case "atom":
    default:
      entries = (feedJSON as AtomJSON).feed.entry
        .map(
          (entry) =>
            ({
              sync_service_id: id,
              sync_service_type: type,
              content_id: entry.id._text,
              title: entry.title._text,
              content: entry.summary._text,
              url: entry.link._attributes.href,
              metadata: JSON.stringify(entry),
              is_secret: secret,
              created_at: new Date(entry.published._text),
              updated_at: new Date(entry.updated._text),
            }) as TimelineItem,
        )
        .filter((entry) => entry.created_at >= from);
  }
  logger.info(`Synced ${entries.length} feed entries from ${logUrl}.`);

  await insertOrUpdateTimelineItems(entries);
  logger.success(
    `Insert or update ${entries.length} feed entries from ${logUrl} successfully!`,
  );
};
