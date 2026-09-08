import axios from "axios";
import { sleep } from "bun";
import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";

import config from "../../../configs/server";
import type {
  SyncServiceSteamGameReview,
  SyncServiceSteamRecentlyPlayedTime,
} from "../../../interfaces/server";
import { insertOrUpdateTimelineItems } from "../database/controller/timeline-item";
import { withRetry } from "../utils/promise";

interface SteamUserSummary {
  steamid: string;
  communityvisibilitystate: number;
  profilestate: number;
  personaname: string;
  profileurl: string;
  avatar: string;
  avatarmedium: string;
  avatarfull: string;
  avatarhash: string;
  lastlogoff: number;
  personastate: number;
  realname: string;
  primaryclanid: string;
  timecreated: number;
  personastateflags: number;
  loccountrycode: string;
  locstatecode: string;
  loccityid: number;
}

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

let steamAccountDetails: SteamUserSummary;
export const getSteamAccountDetails = async (steamId: string) => {
  if (!steamAccountDetails) {
    const getSteamAccountDetailsRes = await axios.get(
      "https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002",
      {
        params: {
          key: config.steamWebAPIKey,
          steamids: steamId,
        },
      },
    );
    const accountDetails = getSteamAccountDetailsRes.data.response
      .players[0] as SteamUserSummary;
    console.log(
      `Auth to Steam successfully! You are logged as ${accountDetails.personaname}.`,
    );

    steamAccountDetails = accountDetails;
  }

  return steamAccountDetails;
};

const getSteamGameHeaderImage = (appId: number) => {
  return `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`;
};

const getSteamGameCapsuleImage = (appId: number) => {
  return `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/capsule_184x69.jpg`;
};

export const syncSteamRecentlyPlayedGames = async (
  service: SyncServiceSteamRecentlyPlayedTime,
) => {
  const { id, type, secret, steamId } = service;
  const currentDate = new Date();

  console.log(`Syncing Steam recently played games for player ${steamId}...`);
  const getRecentlyPlayedGamesRes = await axios.get(
    "https://api.steampowered.com/IPlayerService/GetRecentlyPlayedGames/v0001",
    {
      params: {
        key: config.steamWebAPIKey,
        steamid: steamId,
        format: "json",
      },
    },
  );

  const recentlyPlayedGames = getRecentlyPlayedGamesRes.data.response
    .games as SteamGamePlaytime[];
  console.log(
    `Synced ${recentlyPlayedGames.length} records of Steam recently played games for player ${steamId}.`,
  );

  await insertOrUpdateTimelineItems(
    recentlyPlayedGames.map((game) => ({
      sync_service_id: id,
      sync_service_type: type,
      content_id: currentDate.toLocaleDateString(),
      attachments: [
        { filename: "header.jpg", url: getSteamGameHeaderImage(game.appid) },
        { filename: "capsule.jpg", url: getSteamGameCapsuleImage(game.appid) },
      ],
      metadata: JSON.stringify(game),
      is_secret: secret,
      created_at: currentDate,
      updated_at: currentDate,
    })),
  );
  console.log(
    `Insert or update ${recentlyPlayedGames.length} records of Steam recently played games for player ${steamId} successfully!`,
  );
};

interface SteamGameReview {
  appId: number;
  reviewUrl: string;
  coverImageUrl: string;
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
      /^(\d{1,2})\s+(\w+),?\s*(\d{4})?\s*@\s*(\d{1,2}):(\d{2})\s*(am|pm)$/i,
    );
  if (!match) return null;
  const [, dayStr, monthStr, yearStr, hourStr, minuteStr, ampm] = match;

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

  const zdt = Temporal.ZonedDateTime.from({
    year,
    month,
    day,
    hour,
    minute,
    timeZone: "America/Los_Angeles",
  });

  return new Date(zdt.epochMilliseconds);
};

const fetchSteamReviewDetail = async (reviewUrl: string) => {
  try {
    const res = await axios.get(reviewUrl, {
      params: { l: STEAM_REQUEST_LANG },
      timeout: 10000,
    });
    const $ = cheerio.load(res.data);

    const coverImageUrl = $("#rightContents img.game_capsule").attr("src");

    const recommendationDateHtml = $(".recommendation_date").html() || "";
    const postedMatch = recommendationDateHtml.match(
      /Posted:\s*(.+?)(?:<br|$)/i,
    );
    const postedAt = postedMatch
      ? parseSteamReviewDetailDateText(postedMatch[1].trim())
      : null;
    const updatedMatch = recommendationDateHtml.match(
      /Updated:\s*(.+?)(?:<br|$)/i,
    );
    const editedAt = updatedMatch
      ? parseSteamReviewDetailDateText(updatedMatch[1].trim())
      : null;

    return { coverImageUrl, postedAt, editedAt };
  } catch (error) {
    console.warn(`Failed to fetch review detail for ${reviewUrl}:`, error);
    return { coverImageUrl: null, postedAt: null, editedAt: null };
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

  const detail = await fetchSteamReviewDetail(reviewUrl);
  const { coverImageUrl, postedAt, editedAt } = detail;
  if (!coverImageUrl || !postedAt) {
    throw new Error(
      "Parse steam review element failed: missing coverImageUrl or postedAt",
    );
  }

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
    coverImageUrl,
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

  console.log(`Syncing Steam game reviews of ${userId}...`);

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
              console.warn(
                `Failed to parse Steam game review element, attempt ${attempt}:`,
                err,
              ),
          },
        );
        if (parsedReview) {
          reviews.push(parsedReview);
        }
        await sleep(STEAM_REQUEST_BASE_DELAY);
      } catch (error) {
        console.warn("Failed to parse Steam game review element:", error);
      }
    }

    if ($reviewBoxes.length === STEAM_GAME_REVIEWS_PAGE_SIZE) {
      page += 1;
    } else {
      queryFinished = true;
    }
  }
  console.log(`Synced ${reviews.length} Steam game reviews of ${userId}.`);

  await insertOrUpdateTimelineItems(
    reviews.map((review) => ({
      sync_service_id: id,
      sync_service_type: type,
      content_id: String(review.appId),
      title: review.recommended ? "推荐" : "不推荐",
      content: review.content,
      url: review.reviewUrl,
      attachments: [{ filename: "capsule.jpg", url: review.coverImageUrl }],
      metadata: JSON.stringify(review),
      is_secret: secret,
      created_at: review.postedAt,
      updated_at: review.editedAt ?? review.postedAt,
    })),
  );
  console.log(
    `Insert or update ${reviews.length} timeline items of Steam game reviews of ${userId} successfully!`,
  );
};
