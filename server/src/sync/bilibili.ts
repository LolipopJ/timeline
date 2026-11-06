import axios from "axios";
import { z } from "zod";

import { USER_AGENT_DESKTOP } from "../constants";
import {
  getSyncTaskLastExecuteTime,
  insertOrUpdateTimelineItems,
} from "../database/controller/timeline-item";
import type {
  SyncServiceBilibiliCollection,
  SyncServiceBilibiliWork,
} from "../types/config";
import { createLogger } from "../utils/logger";

const logger = createLogger("Bilibili");

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

const bilibiliWork = z.looseObject({
  aid: z.int().positive(),
  title: z.string(),
  desc: z.string().nullish(),
  pubdate: z.int().nonnegative(),
  ctime: z.int().nonnegative(),
  pic: z.string(),
  bvid: z.string(),
});

const bilibiliWorksPage = z.object({
  archives: z.array(bilibiliWork.nullable()).nullish(),
  page: z.object({
    num: z.int().positive(),
    size: z.int().positive(),
    total: z.int().nonnegative(),
  }),
});

export const syncBilibiliCollections = async (
  service: SyncServiceBilibiliCollection,
) => {
  const { id, type, from, secret, mediaId, full } = service;

  const lastExecuteDate = await getSyncTaskLastExecuteTime({
    id,
    from,
    full,
  });
  logger.info(
    `Syncing Bilibili collections from ${mediaId} since ${lastExecuteDate.toISOString()}...`,
  );

  const collections: BilibiliCollection[] = [];
  let queryFinished = false;
  let page = 1;
  const perPage = 36;
  while (!queryFinished) {
    const getCollectionsRes = await axios.get(
      "https://api.bilibili.com/x/v3/fav/resource/list",
      {
        params: {
          media_id: mediaId,
          pn: page,
          ps: perPage,
          keyword: "",
          order: "mtime",
          type: 0,
          tid: 0,
          platform: "web",
          space_login_group: 3,
          web_location: 0.0,
          ["x-bili-locale-json"]: {},
          ["x-bili-device-req-json"]: {
            platform: "web",
            device: "pc",
            spmid: "0.0",
            mobi_app: "web_cn",
          },
        },
      },
    );
    const queriedCollections: BilibiliCollection[] =
      getCollectionsRes.data.data.medias ?? [];
    const filteredCollections = queriedCollections.filter(
      (collection) => collection.fav_time * 1000 > lastExecuteDate.getTime(),
    );
    collections.push(...filteredCollections);

    if (filteredCollections.length > 0) {
      // 不使用 perPage 判断结束，是因为接口可能返回少于 perPage 的数据，但仍有更多未同步的收藏
      page += 1;
    } else {
      queryFinished = true;
    }
  }
  logger.info(
    `Synced ${collections.length} Bilibili collections from ${mediaId}.`,
  );

  const itemCount = await insertOrUpdateTimelineItems(
    collections
      .filter((collection) => collection.attr === 0)
      .map((collection) => {
        const cTime = new Date(collection.ctime * 1000);

        let favTime = new Date(collection.fav_time * 1000);
        if (favTime.toISOString() === "2020-07-06T15:35:56.000Z") {
          // B 站接口没有记录此日期前的收藏时间，因此将接口中的 ctime 记录为收藏时间
          favTime = cTime;
        }

        return {
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
              created_at: cTime,
            },
          ],
          metadata: JSON.stringify(collection),
          is_secret: secret,
          created_at: favTime,
          updated_at: favTime,
        };
      }),
  );
  logger.success(
    `Insert or update ${itemCount} timeline items of Bilibili collections from ${mediaId} successfully!`,
  );
  return itemCount;
};

export const syncBilibiliWorks = async (service: SyncServiceBilibiliWork) => {
  const { id, type, secret, userId } = service;
  logger.info(`Syncing Bilibili works of ${userId}...`);

  const requestOptions = {
    headers: { "User-Agent": USER_AGENT_DESKTOP },
    timeout: 10_000,
    maxRedirects: 0,
  };
  const { headers } = await axios.get(
    "https://www.bilibili.com/",
    requestOptions,
  );
  const anonymousCookies = (headers["set-cookie"] ?? []).filter((cookie) =>
    /^(buvid3|b_nut)=[^;]+/.test(cookie),
  );
  if (!anonymousCookies.some((cookie) => cookie.startsWith("buvid3="))) {
    throw new Error(
      `Bilibili did not issue an anonymous session for works of ${userId}.`,
    );
  }
  const cookie = anonymousCookies
    .map((value) => value.split(";", 1)[0])
    .join("; ");

  const works = new Map<number, z.infer<typeof bilibiliWork>>();
  let lastPage = 1;
  for (let page = 1; page <= lastPage; page += 1) {
    const fetchPage = () =>
      axios.get<{ code?: number; data?: unknown }>(
        "https://api.bilibili.com/x/series/recArchivesByKeywords",
        {
          ...requestOptions,
          headers: {
            ...requestOptions.headers,
            Cookie: cookie,
            Referer: `https://space.bilibili.com/${userId}/video`,
          },
          params: {
            mid: userId,
            keywords: "",
            pn: page,
            ps: 100,
            orderby: "pubdate",
          },
          validateStatus: () => true,
        },
      );
    let response = await fetchPage();
    if (response.status === 412 || response.data?.code === -412) {
      logger.warn(
        `Bilibili blocked works of ${userId} on page ${page}. Retrying once.`,
      );
      await Bun.sleep(3_000);
      response = await fetchPage();
    }
    const code = response.data?.code;
    if (response.status !== 200 || code !== 0) {
      throw new Error(
        `Bilibili works request for ${userId} on page ${page} failed (HTTP ${response.status}, API code ${code ?? "unknown"}).`,
      );
    }

    const result = bilibiliWorksPage.safeParse(response.data.data);
    if (!result.success || result.data.page.num !== page) {
      throw new Error(`Invalid Bilibili works page ${page} for ${userId}.`);
    }
    const { archives, page: pageInfo } = result.data;
    for (const work of archives ?? []) {
      if (work) works.set(work.aid, work);
    }
    lastPage = Math.ceil(pageInfo.total / pageInfo.size);
  }
  logger.info(`Synced ${works.size} Bilibili works of ${userId}.`);

  const itemCount = await insertOrUpdateTimelineItems(
    Array.from(works.values(), (work) => ({
      sync_service_id: id,
      sync_service_type: type,
      content_id: String(work.aid),
      title: work.title,
      content: work.desc ?? null,
      url: `https://www.bilibili.com/video/${work.bvid}`,
      attachments: [
        {
          filename: `cover.${work.pic.split(".").pop()}`,
          url: work.pic,
        },
      ],
      metadata: JSON.stringify(work),
      is_secret: secret,
      created_at: new Date(work.ctime * 1000),
      updated_at: new Date(work.pubdate * 1000),
    })),
  );
  logger.success(
    `Insert or update ${itemCount} timeline items of Bilibili works of ${userId} successfully!`,
  );
  return itemCount;
};
