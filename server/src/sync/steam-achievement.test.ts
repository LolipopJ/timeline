import { SyncServiceType } from "@timeline/contracts";
import axios from "axios";
import { expect, test } from "bun:test";

import type { SyncServiceSteamGameAchievement } from "../types/config";
import { calculateMilestones } from "./achievement";
import {
  getSteamAchievementDetails,
  getSteamAchievementSummaries,
  normalizeSteamGame,
  parseSteamCatalog,
} from "./steam-achievement";

test("Steam collects unlisted apps and distinguishes base completion from DLC", async () => {
  const adapter = axios.defaults.adapter;
  axios.defaults.adapter = async (config) => {
    const url = new URL(axios.getUri(config));
    const respond = (data: unknown) => ({
      data,
      status: 200,
      statusText: "OK",
      headers: {},
      config,
    });
    if (url.pathname.includes("GetOwnedGames")) {
      return respond({
        response: {
          game_count: 2,
          games: [20, 30].map((appid) => ({ appid, name: `Game ${appid}` })),
        },
      });
    }
    if (url.pathname.includes("IStoreBrowseService/GetItems")) {
      return respond({
        response: {
          store_items: [
            {
              appid: 20,
              assets: {
                library_capsule:
                  "0123456789abcdef0123456789abcdef01234567/library_capsule.jpg",
                library_capsule_2x:
                  "0123456789abcdef0123456789abcdef01234567/library_capsule_2x.jpg",
              },
            },
          ],
        },
      });
    }
    const appId = Number(
      url.searchParams.get("appid") ?? url.pathname.split("/").at(-1),
    );
    const ids = appId === 10 ? ["original"] : ["original", "expansion"];
    if (url.pathname.includes("GetSchemaForGame")) {
      return respond({
        game: {
          gameName: `Game ${appId}`,
          availableGameStats: { achievements: ids.map((name) => ({ name })) },
        },
      });
    }
    if (url.pathname.includes("GetPlayerAchievements")) {
      return respond({
        playerstats: {
          success: true,
          achievements: ids.map((apiname, i) => ({
            apiname,
            achieved: i === 0 ? 1 : 0,
            unlocktime: i === 0 ? 1_600_000_000 : 0,
          })),
        },
      });
    }
    expect(url.href).toBe(`https://steamcommunity.com/achievements/${appId}`);
    const publicGroup = (id: number, dlcappid: number, ...names: string[]) => ({
      id,
      dlcappid,
      ispublic: true,
      developeronly: false,
      archived: false,
      achievements: names.map((api_name) => ({ api_name, groupid: id })),
    });
    const groups =
      appId === 20
        ? [publicGroup(2, 21, "expansion"), publicGroup(0, 0, "original")]
        : [publicGroup(0, 0, ...ids)];
    const queryData = JSON.stringify({
      queries: [
        {
          queryKey: ["achievements", appId, "schema_v2"],
          state: { data: { appid: appId, groups } },
        },
      ],
    });
    return respond(
      `<script type="application/json" id="valve-ssr-data">${JSON.stringify({ renderContext: { queryData } })}</script>`,
    );
  };
  const service: SyncServiceSteamGameAchievement = {
    id: "steam-fixture",
    type: SyncServiceType.STEAM_GAME_ACHIEVEMENT,
    steamId: "1",
    steamWebAPIKey: "fixture",
    gameOverrides: { 10: {}, 30: { baseAchievementCount: 1 } },
  };
  try {
    const summaries = await getSteamAchievementSummaries(service);
    const games = await getSteamAchievementDetails(service, summaries);
    expect(games.map(({ coverUrl }) => coverUrl)).toEqual([
      "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/20/0123456789abcdef0123456789abcdef01234567/library_capsule_2x.jpg",
      "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/30/library_600x900.jpg",
      "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/10/library_600x900.jpg",
    ]);
    const milestones = games.flatMap((game) =>
      calculateMilestones("steam", "1", game).map((m) => [
        game.gameId,
        m.slot,
        m.achievement.totalCount,
        m.createdAt,
      ]),
    );
    expect(milestones).toEqual([
      ["20", "base", 1, "2020-09-13T12:26:40.000Z"],
      ["30", "base", 1, "2020-09-13T12:26:40.000Z"],
      ["10", "all", 1, "2020-09-13T12:26:40.000Z"],
    ]);
    await expect(
      getSteamAchievementDetails(
        {
          ...service,
          gameOverrides: { 30: { baseAchievementCount: 3 } },
        },
        summaries.filter(({ gameId }) => gameId === "30"),
      ),
    ).rejects.toThrow("STEAM_INVALID_CONFIGURED_BASE_SET");
  } finally {
    axios.defaults.adapter = adapter;
  }
});

test("Steam uses every current definition and real dates without inventing base groups", () => {
  const summary = { gameId: "10", title: "Game", signature: "v1" };
  const schema = {
    game: {
      gameName: "Game",
      availableGameStats: {
        achievements: [{ name: "base" }, { name: "dlc", hidden: 1 }],
      },
    },
  };
  const unlocks = {
    playerstats: {
      success: true,
      achievements: [
        { apiname: "base", achieved: 1, unlocktime: 1_600_000_000 },
        { apiname: "dlc", achieved: 1, unlocktime: 1_700_000_000 },
      ],
    },
  };
  const game = normalizeSteamGame(summary, schema, unlocks);
  expect(() =>
    normalizeSteamGame(summary, schema, {
      playerstats: {
        success: true,
        achievements: [
          ...unlocks.playerstats.achievements,
          { apiname: "new-dlc", achieved: 0, unlocktime: 0 },
        ],
      },
    }),
  ).toThrow("INCOMPLETE");
  expect(game.base).toBeUndefined();
  expect(
    calculateMilestones("steam", "1", game).map((m) => [m.slot, m.createdAt]),
  ).toEqual([["all", "2023-11-14T22:13:20.000Z"]]);
  const invalidTime = normalizeSteamGame(summary, schema, {
    playerstats: {
      success: true,
      achievements: [
        unlocks.playerstats.achievements[0],
        { apiname: "dlc", achieved: 1, unlocktime: 1e20 },
      ],
    },
  });
  expect(invalidTime.achievements[1]).toMatchObject({
    unlocked: true,
    unlockedAt: undefined,
  });
  expect(calculateMilestones("steam", "1", invalidTime)).toEqual([]);
  expect(
    normalizeSteamGame(summary, { game: { gameName: "Game" } }, undefined)
      .achievements,
  ).toEqual([]);
  expect(
    normalizeSteamGame(summary, { game: {} }, undefined).achievements,
  ).toEqual([]);
  expect(() =>
    normalizeSteamGame(summary, schema, {
      playerstats: { success: true, achievements: [] },
    }),
  ).toThrow("INCOMPLETE");
  expect(() =>
    normalizeSteamGame(summary, schema, { playerstats: { success: false } }),
  ).toThrow("UNAVAILABLE");
  expect(parseSteamCatalog({ response: { game_count: 0 } })).toEqual([]);
  expect(() => parseSteamCatalog({ response: {} })).toThrow("UNAVAILABLE");
});
