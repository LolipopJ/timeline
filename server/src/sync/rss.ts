import axios from "axios";
import { xml2json } from "xml-js";

import type { SyncServiceRSS } from "../../../interface";
import { insertOrUpdateTimelineItems } from "../database/controller/timeline-item";
import type TimelineItem from "../database/entity/timeline-item";

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

export const syncRSS = async (service: SyncServiceRSS) => {
  const { id, type, from = new Date(0), syntax = "atom", url } = service;
  const since = from.toISOString();

  console.log(`Syncing RSS entries from ${url} since ${since}...`);
  const getRSSRes = await axios.get(url);

  const RSSContent = getRSSRes.data;
  const RSSJson = JSON.parse(xml2json(RSSContent, { compact: true }));
  let entries: TimelineItem[] = [];
  switch (syntax) {
    case "atom":
    default:
      entries = (RSSJson as AtomJSON).feed.entry
        .map(
          (entry) =>
            ({
              sync_service_id: id,
              sync_service_type: type,
              content_id: entry.id._text,
              title: entry.title._text,
              content: entry.summary._text,
              url: entry.link._attributes.href,
              created_at: new Date(entry.published._text),
              updated_at: new Date(entry.updated._text),
            }) as TimelineItem,
        )
        .filter((entry) => entry.created_at >= from);
  }
  console.log(`Synced ${entries.length} RSS entries from ${url}.`);

  await insertOrUpdateTimelineItems(entries);
  console.log(
    `Insert or update ${entries.length} RSS entries from ${url} successfully!`,
  );
};
