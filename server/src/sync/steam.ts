import axios from "axios";

import config from "../../../configs/server";
import type { SyncServiceSteamRecentlyPlayedTime } from "../../../interfaces";
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
  const { id, type, steamId } = service;
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
      created_at: currentDate,
      updated_at: currentDate,
    })),
  );
  console.log(
    `Insert or update ${recentlyPlayedGames.length} records of Steam recently played games for player ${steamId} successfully!`,
  );
};
