import axios from "axios";

import type { SyncServiceBilibiliCollection } from "../../../interfaces";
import {
  getSyncTaskLastExecuteTime,
  insertOrUpdateTimelineItems,
} from "../database/controller/timeline-item";

interface BilibiliCollection {
  id: number;
  type: number;
  title: string;
  cover: string;
  intro: string;
  page: number;
  duration: number;
  upper: {
    mid: number;
    name: string;
    face: string;
  };
  /** 不为 0 则为已失效视频 */
  attr: number;
  cnt_info: {
    collect: number;
    play: number;
    danmaku: number;
    vt: number;
    play_switch: number;
    reply: number;
    view_text_1: string;
  };
  link: string;
  ctime: number;
  pubtime: number;
  fav_time: number;
  bv_id: string;
  bvid: string;
  ugc: {
    first_cid: number;
  };
  media_list_link: string;
}

export const syncBilibiliCollections = async (
  service: SyncServiceBilibiliCollection,
) => {
  const { id, type, from, mediaId } = service;

  const lastExecuteDate = await getSyncTaskLastExecuteTime({
    id,
    from,
  });
  console.log(
    `Syncing Bilibili collections from ${mediaId} since ${lastExecuteDate.toISOString()}...`,
  );

  const collections: BilibiliCollection[] = [];
  let queryFinished = false;
  let page = 1;
  while (!queryFinished) {
    const getCollectionsRes = await axios.get(
      "https://api.bilibili.com/x/v3/fav/resource/list",
      {
        params: {
          media_id: mediaId,
          pn: page,
          ps: 20,
          order: "mtime",
          type: 0,
          tid: 0,
          platform: "web",
        },
      },
    );
    const queriedCollections: BilibiliCollection[] =
      getCollectionsRes.data.data.medias ?? [];
    const filteredCollections = queriedCollections.filter(
      (collection) =>
        collection.fav_time * 1000 > lastExecuteDate.getTime() &&
        collection.attr === 0,
    );
    collections.push(...filteredCollections);

    if (filteredCollections.length > 0) {
      page += 1;
    } else {
      queryFinished = true;
    }
  }
  console.log(
    `Synced ${collections.length} Bilibili collections from ${mediaId}.`,
  );

  await insertOrUpdateTimelineItems(
    collections.map((collection) => ({
      sync_service_id: id,
      sync_service_type: type,
      content_id: String(collection.id),
      title: collection.title,
      content: collection.intro,
      url: `https://www.bilibili.com/video/${collection.bvid}`,
      attachments: [
        {
          filename: `cover.${collection.cover.split(".").pop()}`,
          url: collection.cover,
          created_at: new Date(collection.ctime * 1000),
        },
      ],
      metadata: JSON.stringify(collection),
      created_at: new Date(collection.fav_time * 1000),
      updated_at: new Date(collection.fav_time * 1000),
    })),
  );
  console.log(
    `Insert or update ${collections.length} timeline items of Bilibili collections from ${mediaId} successfully!`,
  );
};
