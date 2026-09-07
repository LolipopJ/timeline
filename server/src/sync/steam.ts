import axios from "axios";
import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";

import config from "../../../configs/server";
import type {
  SyncServiceSteamGameReview,
  SyncServiceSteamRecentlyPlayedTime,
} from "../../../interfaces/server";
import { insertOrUpdateTimelineItems } from "../database/controller/timeline-item";

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

const STEAM_REVIEW_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** 解析形如 `5 September` 或 `4 December, 2025` 的评测日期文本，缺省年份视为当前年份 */
const parseSteamReviewDateText = (dateText: string) => {
  const match = dateText.trim().match(/^(\d{1,2}) (\w+)(?:, (\d{4}))?$/);
  if (!match) {
    return null;
  }

  const [, day, monthName, year] = match;
  const month = STEAM_REVIEW_MONTHS.indexOf(monthName);
  if (month === -1) {
    return null;
  }

  return new Date(Number(year ?? new Date().getFullYear()), month, Number(day));
};

const parseSteamGameReviewElement = (
  $reviewBox: cheerio.Cheerio<AnyNode>,
): SteamGameReview | null => {
  const gameLinkHref = $reviewBox
    .find(".leftcol a.game_capsule_ctn")
    .attr("href");
  const appId = Number(gameLinkHref?.match(/\/app\/(\d+)/)?.[1]);
  const coverImageUrl = $reviewBox
    .find(".leftcol img.game_capsule")
    .attr("src");
  const reviewUrl = $reviewBox.find(".thumb a").attr("href");
  if (!appId || !coverImageUrl || !reviewUrl) {
    return null;
  }

  const hoursText = $reviewBox.find(".hours").text();
  const hoursOnRecord = parseFloat(
    (hoursText.match(/([\d,.]+)\s*hrs on record/)?.[1] ?? "").replace(/,/g, ""),
  );
  const hoursAtReviewTimeText = hoursText.match(
    /\(([\d,.]+)\s*hrs at review time\)/,
  )?.[1];
  if (Number.isNaN(hoursOnRecord)) {
    return null;
  }

  const postedText = $reviewBox.find(".posted").text();
  const postedAt = parseSteamReviewDateText(
    postedText.match(/Posted ([^.]+)\./)?.[1] ?? "",
  );
  const editedAt = parseSteamReviewDateText(
    postedText.match(/Last edited ([^.]+)\./)?.[1] ?? "",
  );
  if (!postedAt) {
    return null;
  }

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
    hoursAtReviewTime: hoursAtReviewTimeText
      ? parseFloat(hoursAtReviewTimeText.replace(/,/g, ""))
      : null,
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
        params: { p: page, l: "english" },
        timeout: 10000,
      },
    );

    const $ = cheerio.load(getReviewsRes.data);
    const queriedReviews = $(".review_box")
      .map((_, el) => parseSteamGameReviewElement($(el)))
      .get()
      .filter((review): review is SteamGameReview => !!review);
    reviews.push(...queriedReviews);

    if (queriedReviews.length === STEAM_GAME_REVIEWS_PAGE_SIZE) {
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
