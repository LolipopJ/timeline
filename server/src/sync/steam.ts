import axios from "axios";
import { sleep } from "bun";
import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";

import { insertOrUpdateTimelineItems } from "../database/controller/timeline-item";
import type {
  SyncServiceSteamGameReview,
  SyncServiceSteamRecentlyPlayedTime,
} from "../types/config";
import { createLogger, formatError } from "../utils/logger";
import { withRetry } from "../utils/promise";

const logger = createLogger("Steam");

interface SteamGamePlaytime {
  appid: number;
  name: string;
  /** mins */
  playtime_2weeks: number;
  playtime_forever: number;
  img_icon_url: string;
  playtime_windows_forever: number;
  playtime_mac_forever: number;
  playtime_linux_forever: number;
  playtime_deck_forever: number;
}

const STEAM_APP_ASSETS_URL =
  "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps";

export const getSteamGameCover = (appId: number, publishedUrl?: string) => ({
  filename: "cover.jpg",
  url: publishedUrl ?? `${STEAM_APP_ASSETS_URL}/${appId}/library_600x900.jpg`,
});

interface SteamStoreItem {
  appid: number;
  assets?: {
    library_capsule?: string;
    library_capsule_2x?: string;
  };
}

export const fetchSteamGameCoverUrls = async (appIds: number[]) => {
  const unique = [...new Set(appIds)];
  const covers = new Map<number, string>();
  for (let offset = 0; offset < unique.length; offset += 40) {
    const batch = unique.slice(offset, offset + 40);
    try {
      const { data } = await axios.get<{
        response?: { store_items?: SteamStoreItem[] };
      }>("https://api.steampowered.com/IStoreBrowseService/GetItems/v1/", {
        params: {
          input_json: JSON.stringify({
            ids: batch.map((appid) => ({ appid })),
            context: { language: "english", country_code: "US" },
            data_request: { include_assets: true },
          }),
        },
        timeout: 10_000,
      });
      const items = data?.response?.store_items;
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        if (!item || !batch.includes(item.appid)) continue;
        const capsule = item.assets?.library_capsule;
        const asset =
          typeof capsule === "string" && capsule.endsWith("library_600x900.jpg")
            ? capsule
            : item.assets?.library_capsule_2x || capsule;
        if (
          typeof asset === "string" &&
          /^(?:[a-f0-9]{40}\/)?library_(?:600x900|capsule)(?:_2x)?\.jpg$/.test(
            asset,
          )
        )
          covers.set(
            item.appid,
            `${STEAM_APP_ASSETS_URL}/${item.appid}/${asset}`,
          );
      }
    } catch {
      logger.warn("Could not load Steam store library covers.");
    }
  }
  return covers;
};

export const syncSteamRecentlyPlayedGames = async (
  service: SyncServiceSteamRecentlyPlayedTime,
) => {
  const { id, type, secret, steamId, steamWebAPIKey } = service;
  if (!steamWebAPIKey)
    throw new Error(
      "STEAM_API_KEY_REQUIRED: configure steamWebAPIKey on this service.",
    );
  const currentDate = new Date();

  logger.info(`Syncing Steam recently played games for player ${steamId}...`);
  const getRecentlyPlayedGamesRes = await axios.get(
    "https://api.steampowered.com/IPlayerService/GetRecentlyPlayedGames/v0001",
    {
      params: {
        key: steamWebAPIKey,
        steamid: steamId,
        format: "json",
      },
    },
  );

  const recentlyPlayedGames = getRecentlyPlayedGamesRes.data.response
    .games as SteamGamePlaytime[];
  logger.info(
    `Synced ${recentlyPlayedGames.length} records of Steam recently played games for player ${steamId}.`,
  );

  const covers = await fetchSteamGameCoverUrls(
    recentlyPlayedGames.map((game) => game.appid),
  );
  const itemCount = await insertOrUpdateTimelineItems(
    recentlyPlayedGames.map((game) => ({
      sync_service_id: id,
      sync_service_type: type,
      content_id: currentDate.toLocaleDateString(),
      attachments: [getSteamGameCover(game.appid, covers.get(game.appid))],
      metadata: JSON.stringify(game),
      is_secret: secret,
      created_at: currentDate,
      updated_at: currentDate,
    })),
  );
  logger.success(
    `Insert or update ${itemCount} records of Steam recently played games for player ${steamId} successfully!`,
  );
  return itemCount;
};

interface SteamGameReview {
  appId: number;
  reviewUrl: string;
  recommended: boolean;
  /** 总时数（小时） */
  hoursOnRecord: number;
  /** 评测时时数（小时），无该数据时为 null */
  hoursAtReviewTime: number | null;
  content: string;
  postedAt: Date;
  /** 无编辑记录时为 null */
  editedAt: Date | null;
}

/** 评测页面最多展示的评测数，用于判断是否翻至最后一页 */
const STEAM_GAME_REVIEWS_PAGE_SIZE = 10;
/** 请求评测页面使用的语言，后续基于此语言进行解析 */
const STEAM_REQUEST_LANG = "english";
/** 请求评测页面的基础延迟（毫秒） */
const STEAM_REQUEST_BASE_DELAY = 2000;
/** 评测页面日期相关的月份缩写 */
const STEAM_DETAIL_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const parseSteamReviewDetailDateText = (dateText: string): Date | null => {
  if (!dateText) return null;

  const match = dateText
    .trim()
    .match(
      /^(\w{3,9})\s+(\d{1,2}),?\s*(?:(\d{4})\s*)?@\s*(\d{1,2}):(\d{2})\s*(am|pm)$/i,
    );
  if (!match) return null;
  const [, monthStr, dayStr, yearStr, hourStr, minuteStr, ampm] = match;

  const year = yearStr ? parseInt(yearStr, 10) : new Date().getFullYear();
  const month =
    STEAM_DETAIL_MONTHS.findIndex(
      (m) => m.toLowerCase() === monthStr.toLowerCase(),
    ) + 1;
  if (month === 0) return null;
  const day = parseInt(dayStr, 10);
  let hour = parseInt(hourStr, 10);
  // 12 小时制转 24 小时制
  const isPm = ampm.toLowerCase() === "pm";
  if (isPm && hour !== 12) hour += 12;
  if (!isPm && hour === 12) hour = 0;
  const minute = parseInt(minuteStr, 10);

  const dateTimeFields = {
    year,
    month,
    day,
    hour,
    minute,
    timeZone: "America/Los_Angeles",
  };
  const zdt = Temporal.ZonedDateTime.from(dateTimeFields);

  return new Date(zdt.epochMilliseconds);
};

const fetchSteamReviewDetail = async (reviewUrl: string) => {
  try {
    const res = await axios.get(reviewUrl, {
      params: { l: STEAM_REQUEST_LANG },
      timeout: 10000,
    });
    const $ = cheerio.load(res.data);

    const recommendationDateHtml = $(".recommendation_date").html() || "";
    const postedMatch = recommendationDateHtml.match(
      /Posted:\s*(.+?)(?:<br|$)/i,
    );
    if (!postedMatch) {
      throw new Error(
        `Failed to find posted date. Page structure may have changed.`,
      );
    }
    const postedAt = parseSteamReviewDetailDateText(postedMatch[1].trim());
    if (!postedAt) {
      throw new Error(
        `Failed to parse posted date, original posted date text: ${postedMatch[1]}`,
      );
    }
    const updatedMatch = recommendationDateHtml.match(
      /Updated:\s*(.+?)(?:<br|$)/i,
    );
    const editedAt = updatedMatch
      ? parseSteamReviewDetailDateText(updatedMatch[1].trim())
      : null;

    return { postedAt, editedAt };
  } catch (error) {
    logger.warn(
      `Failed to fetch review detail for ${reviewUrl}:\n${formatError(error)}`,
    );
    return { postedAt: null, editedAt: null };
  }
};

const parseSteamGameReviewElement = async (
  $reviewBox: cheerio.Cheerio<AnyNode>,
): Promise<SteamGameReview | null> => {
  const gameLinkHref = $reviewBox
    .find(".leftcol a.game_capsule_ctn")
    .attr("href");
  const appId = Number(gameLinkHref?.match(/\/app\/(\d+)/)?.[1]);
  const reviewUrl = $reviewBox.find(".thumb a").attr("href");
  if (!appId || !reviewUrl) {
    throw new Error(
      "Parse steam review element failed: missing appId or reviewUrl",
    );
  }

  const { postedAt, editedAt } = await fetchSteamReviewDetail(reviewUrl);
  if (!postedAt)
    throw new Error("Parse steam review element failed: missing postedAt");

  const hoursText = $reviewBox.find(".hours").text();
  const hoursOnRecord = parseFloat(
    (hoursText.match(/([\d,.]+)\s*hrs on record/)?.[1] ?? "").replace(/,/g, ""),
  );
  const hoursAtReviewTimeText = hoursText.match(
    /\(([\d,.]+)\s*hrs at review time\)/,
  )?.[1];
  const hoursAtReviewTime = hoursAtReviewTimeText
    ? parseFloat(hoursAtReviewTimeText.replace(/,/g, ""))
    : null;

  const content = $reviewBox
    .find(".content")
    .clone()
    .removeClass("content")
    .toString();

  const recommended = !!$reviewBox
    .find(".thumb img")
    .attr("src")
    ?.includes("thumbsUp");

  return {
    appId,
    reviewUrl,
    recommended,
    hoursOnRecord,
    hoursAtReviewTime,
    content,
    postedAt,
    editedAt,
  };
};

export const syncSteamGameReviews = async (
  service: SyncServiceSteamGameReview,
) => {
  const { id, type, secret, userId } = service;

  logger.info(`Syncing Steam game reviews of ${userId}...`);

  const reviews: SteamGameReview[] = [];
  let queryFinished = false;
  let page = 1;
  while (!queryFinished) {
    const getReviewsRes = await axios.get(
      `https://steamcommunity.com/id/${userId}/recommended/`,
      {
        params: { p: page, l: STEAM_REQUEST_LANG },
        timeout: 10000,
      },
    );

    const $ = cheerio.load(getReviewsRes.data);
    const $reviewBoxes = $(".review_box")
      .toArray()
      .map((el) => $(el));
    for (const $reviewBox of $reviewBoxes) {
      try {
        const parsedReview = await withRetry(
          () => parseSteamGameReviewElement($reviewBox),
          {
            maxRetries: 3,
            baseDelayMs: STEAM_REQUEST_BASE_DELAY,
            onRetry: (attempt, err) =>
              logger.warn(
                `Failed to parse Steam game review element, attempt ${attempt}:\n${formatError(err)}`,
              ),
          },
        );
        if (parsedReview) {
          reviews.push(parsedReview);
        }
        await sleep(STEAM_REQUEST_BASE_DELAY);
      } catch (error) {
        logger.warn(
          `Failed to parse Steam game review element:\n${formatError(error)}`,
        );
      }
    }

    if ($reviewBoxes.length === STEAM_GAME_REVIEWS_PAGE_SIZE) {
      page += 1;
    } else {
      queryFinished = true;
    }
  }
  logger.info(`Synced ${reviews.length} Steam game reviews of ${userId}.`);

  const covers = await fetchSteamGameCoverUrls(
    reviews.map(({ appId }) => appId),
  );
  const itemCount = await insertOrUpdateTimelineItems(
    reviews.map((review) => ({
      sync_service_id: id,
      sync_service_type: type,
      content_id: String(review.appId),
      title: review.recommended ? "推荐" : "不推荐",
      content: review.content,
      url: review.reviewUrl,
      attachments: [getSteamGameCover(review.appId, covers.get(review.appId))],
      metadata: JSON.stringify(review),
      is_secret: secret,
      created_at: review.postedAt,
      updated_at: review.editedAt ?? review.postedAt,
    })),
  );
  logger.success(
    `Insert or update ${itemCount} timeline items of Steam game reviews of ${userId} successfully!`,
  );
  return itemCount;
};
