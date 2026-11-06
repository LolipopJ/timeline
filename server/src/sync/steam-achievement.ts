import axios from "axios";
import { load } from "cheerio";

import type { SyncServiceSteamGameAchievement } from "../types/config";
import { createLogger } from "../utils/logger";
import { withRetry } from "../utils/promise";
import type { GameSummary, NormalizedGame } from "./achievement";
import { achievementFingerprint, validUnlockDate } from "./achievement";
import { syncGameAchievements } from "./achievement-sync";
import { fetchSteamGameCoverUrls, getSteamGameCover } from "./steam";

const logger = createLogger("SteamAchievements");

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const steamRequest = async (
  key: string,
  endpoint: string,
  params: Record<string, string | number | boolean>,
): Promise<unknown> => {
  if (!key)
    throw new Error(
      "STEAM_API_KEY_REQUIRED: configure steamWebAPIKey on this service.",
    );
  try {
    return await withRetry(
      async () =>
        (
          await axios.get<unknown>(`https://api.steampowered.com/${endpoint}`, {
            params: { ...params, key },
            timeout: 30_000,
          })
        ).data,
      { maxRetries: 2, baseDelayMs: 500 },
    );
  } catch {
    throw new Error(
      "STEAM_REQUEST_FAILED: check API key, visibility and platform availability.",
    );
  }
};

const steamSummary = (
  appId: number,
  title: string,
  signature: string,
): GameSummary => ({
  gameId: String(appId),
  title,
  url: `https://steamcommunity.com/stats/${appId}/achievements/`,
  coverUrl: getSteamGameCover(appId).url,
  signature,
});

const getSteamSchema = (key: string, appid: string) =>
  steamRequest(key, "ISteamUserStats/GetSchemaForGame/v2/", { appid });

export const parseSteamCatalog = (value: unknown): GameSummary[] => {
  if (!isRecord(value) || !isRecord(value["response"]))
    throw new Error("STEAM_CATALOG_UNAVAILABLE");
  const response = value["response"];
  const count = response["game_count"];
  if (!Number.isInteger(count) || typeof count !== "number" || count < 0)
    throw new Error(
      "STEAM_CATALOG_UNAVAILABLE: make game details visible to the authorized API.",
    );
  const games: unknown = response["games"] ?? (count === 0 ? [] : undefined);
  if (!Array.isArray(games) || games.length !== count)
    throw new Error("STEAM_INCOMPLETE_CATALOG");
  return games.map((game: unknown) => {
    if (
      !isRecord(game) ||
      typeof game["appid"] !== "number" ||
      !Number.isInteger(game["appid"]) ||
      typeof game["name"] !== "string"
    )
      throw new Error("STEAM_INCOMPLETE_CATALOG");
    return steamSummary(
      game["appid"],
      game["name"],
      achievementFingerprint([
        game["playtime_forever"],
        game["rtime_last_played"],
      ]),
    );
  });
};

const steamDefinitions = (schema: unknown) => {
  if (!isRecord(schema) || !isRecord(schema["game"]))
    throw new Error("STEAM_SCHEMA_UNAVAILABLE");
  const game = schema["game"];
  // Verified GetSchemaForGame response for catalog titles without Steam stats.
  if (!Object.keys(game).length) return [];
  if (
    typeof game["gameName"] !== "string" &&
    typeof game["gameVersion"] !== "string"
  )
    throw new Error("STEAM_SCHEMA_UNAVAILABLE");
  const stats = game["availableGameStats"];
  if (stats === undefined) return [];
  if (!isRecord(stats)) throw new Error("STEAM_INCOMPLETE_SCHEMA");
  const achievements: unknown = stats["achievements"] ?? [];
  if (!Array.isArray(achievements)) throw new Error("STEAM_INCOMPLETE_SCHEMA");
  const names = achievements.map((a: unknown) => {
    if (!isRecord(a) || typeof a["name"] !== "string")
      throw new Error("STEAM_INCOMPLETE_SCHEMA");
    return a["name"];
  });
  if (new Set(names).size !== names.length)
    throw new Error("STEAM_DUPLICATE_DEFINITIONS");
  return names;
};

export const normalizeSteamGame = (
  summary: GameSummary,
  schema: unknown,
  unlocks: unknown,
): NormalizedGame => {
  const definitions = steamDefinitions(schema);
  if (!definitions.length) return { ...summary, achievements: [] };
  if (
    !isRecord(unlocks) ||
    !isRecord(unlocks["playerstats"]) ||
    unlocks["playerstats"]["success"] !== true
  )
    throw new Error("STEAM_UNLOCKS_UNAVAILABLE");
  const rows: unknown = unlocks["playerstats"]["achievements"];
  if (!Array.isArray(rows)) throw new Error("STEAM_INCOMPLETE_UNLOCKS");
  const byId = new Map<string, { unlocked: boolean; unlockedAt?: string }>();
  for (const row of rows) {
    if (
      !isRecord(row) ||
      typeof row["apiname"] !== "string" ||
      (row["achieved"] !== 0 && row["achieved"] !== 1)
    )
      throw new Error("STEAM_INCOMPLETE_UNLOCKS");
    const seconds = row["unlocktime"];
    const date =
      typeof seconds === "number" && seconds > 0
        ? new Date(seconds * 1000)
        : undefined;
    const unlockedAt =
      date && Number.isFinite(date.getTime())
        ? validUnlockDate(date.toISOString())
        : undefined;
    if (byId.has(row["apiname"])) throw new Error("STEAM_DUPLICATE_UNLOCKS");
    byId.set(row["apiname"], { unlocked: row["achieved"] === 1, unlockedAt });
  }
  const achievements = definitions.map((id) => {
    const unlock = byId.get(id);
    if (!unlock) throw new Error("STEAM_INCOMPLETE_UNLOCKS");
    return { id, ...unlock };
  });
  if (byId.size !== definitions.length)
    throw new Error(
      "STEAM_INCOMPLETE_DEFINITIONS: schema and unlock IDs changed; retry together.",
    );
  return { ...summary, achievements };
};

const parseSteamBaseSet = (html: string, game: NormalizedGame) => {
  // The public achievement page embeds its definition query as JSON.
  const page: unknown = JSON.parse(load(html)("#valve-ssr-data").text());
  if (!isRecord(page) || !isRecord(page["renderContext"])) return;
  const queryData = page["renderContext"]["queryData"];
  if (typeof queryData !== "string") return;
  const cache: unknown = JSON.parse(queryData);
  if (!isRecord(cache) || !Array.isArray(cache["queries"])) return;
  const appId = Number(game.gameId);
  const query: unknown = cache["queries"].find((value: unknown) => {
    if (!isRecord(value) || !Array.isArray(value["queryKey"])) return false;
    const [domain, app, kind] = value["queryKey"];
    return domain === "achievements" && app === appId && kind === "schema_v2";
  });
  if (!isRecord(query) || !isRecord(query["state"])) return;
  const schema = query["state"]["data"];
  if (!isRecord(schema) || schema["appid"] !== appId) return;
  const groups = schema["groups"];
  if (!Array.isArray(groups) || groups.length < 2) return;

  const remaining = new Set(game.achievements.map(({ id }) => id));
  const seenGroups = new Set<number>();
  let baseIds: string[] | undefined;
  for (const group of groups) {
    if (!isRecord(group) || !Array.isArray(group["achievements"])) return;
    const groupId = group["id"];
    if (typeof groupId !== "number" || seenGroups.has(groupId)) return;
    seenGroups.add(groupId);
    const ids: string[] = [];
    for (const achievement of group["achievements"]) {
      if (!isRecord(achievement) || achievement["groupid"] !== groupId) return;
      const id = achievement["api_name"];
      if (typeof id !== "string" || !remaining.delete(id)) return;
      ids.push(id);
    }
    if (
      groupId === 0 &&
      group["dlcappid"] === 0 &&
      group["ispublic"] === true &&
      group["archived"] === false &&
      group["developeronly"] === false
    ) {
      baseIds = ids;
    }
  }
  // A partial or stale page cannot provide evidence for a smaller completed set.
  if (
    !remaining.size &&
    baseIds?.length &&
    baseIds.length < game.achievements.length
  )
    return baseIds;
};

const getSteamBaseSet = async (game: NormalizedGame) => {
  try {
    const { data } = await axios.get<string>(
      `https://steamcommunity.com/achievements/${game.gameId}`,
      { timeout: 10_000, responseType: "text" },
    );
    return parseSteamBaseSet(data, game);
  } catch {
    logger.warn(
      `Could not read Steam achievement sets for app ${game.gameId}.`,
    );
  }
};

export const getSteamAchievementSummaries = async ({
  steamId,
  steamWebAPIKey,
  gameOverrides,
}: SyncServiceSteamGameAchievement) => {
  const summaries = parseSteamCatalog(
    await steamRequest(steamWebAPIKey, "IPlayerService/GetOwnedGames/v0001/", {
      steamid: steamId,
      include_appinfo: true,
      include_played_free_games: true,
    }),
  );
  const byId = new Map(summaries.map((summary) => [summary.gameId, summary]));
  for (const [id, { baseAchievementCount }] of Object.entries(
    gameOverrides ?? {},
  )) {
    if (!/^[1-9]\d*$/.test(id) || Number(id) > 0xffffffff)
      throw new Error("STEAM_INVALID_CONFIGURED_APP_ID");
    let summary = byId.get(id);
    if (!summary) {
      const schema = await getSteamSchema(steamWebAPIKey, id);
      const game = isRecord(schema) ? schema["game"] : undefined;
      const title = isRecord(game) ? game["gameName"] : undefined;
      if (typeof title !== "string" || !title)
        throw new Error(`STEAM_CONFIGURED_APP_UNAVAILABLE: ${id}`);
      summary = steamSummary(
        Number(id),
        title,
        achievementFingerprint([title]),
      );
      summaries.push(summary);
    }
    if (baseAchievementCount !== undefined)
      summary.signature = achievementFingerprint([
        summary.signature,
        baseAchievementCount,
      ]);
  }
  return summaries;
};

export const getSteamAchievementDetails = async (
  { steamId, steamWebAPIKey, gameOverrides }: SyncServiceSteamGameAchievement,
  summaries: GameSummary[],
): Promise<NormalizedGame[]> => {
  const covers = await fetchSteamGameCoverUrls(
    summaries.map(({ gameId }) => Number(gameId)),
  );
  const games: NormalizedGame[] = [];
  for (const summary of summaries) {
    const schema = await getSteamSchema(steamWebAPIKey, summary.gameId);
    const unlocks = steamDefinitions(schema).length
      ? await steamRequest(
          steamWebAPIKey,
          "ISteamUserStats/GetPlayerAchievements/v0001/",
          {
            steamid: steamId,
            appid: summary.gameId,
          },
        )
      : undefined;
    const appId = Number(summary.gameId);
    const coverUrl = getSteamGameCover(appId, covers.get(appId)).url;
    const game = normalizeSteamGame({ ...summary, coverUrl }, schema, unlocks);
    const nativeBase = game.achievements.some(
      (achievement) => achievement.unlocked,
    )
      ? await getSteamBaseSet(game)
      : undefined;
    const configuredBaseCount =
      gameOverrides?.[summary.gameId]?.baseAchievementCount;
    if (nativeBase) {
      game.base = { kind: "base_completion", achievementIds: nativeBase };
    } else if (configuredBaseCount !== undefined) {
      if (
        !Number.isInteger(configuredBaseCount) ||
        configuredBaseCount <= 0 ||
        configuredBaseCount > game.achievements.length
      )
        throw new Error(`STEAM_INVALID_CONFIGURED_BASE_SET: ${summary.gameId}`);
      game.base = {
        kind: "base_completion",
        achievementIds: game.achievements
          .slice(0, configuredBaseCount)
          .map(({ id }) => id),
      };
    }
    games.push(game);
  }
  return games;
};

export const syncSteamGameAchievements = (
  service: SyncServiceSteamGameAchievement,
) =>
  syncGameAchievements(
    service,
    "steam",
    service.steamId,
    () => getSteamAchievementSummaries(service),
    (games) => getSteamAchievementDetails(service, games),
  );
