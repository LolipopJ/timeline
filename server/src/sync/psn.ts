import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import type { AuthorizationPayload, Trophy, TrophyCounts } from "psn-api";
import {
  exchangeAccessCodeForAuthTokens,
  exchangeNpssoForAccessCode,
  exchangeRefreshTokenForAuthTokens,
  getTitleTrophies,
  getTitleTrophyGroups,
  getUserTitles,
  getUserTrophiesEarnedForTitle,
  getUserTrophyProfileSummary,
} from "psn-api";

import { SERVER_TEMPORARY_DIR } from "../constants";
import type { SyncServicePsnGameAchievement } from "../types/config";
import { withRetry } from "../utils/promise";
import type { GameSummary, NormalizedGame } from "./achievement";
import { achievementFingerprint } from "./achievement";
import { syncGameAchievements } from "./achievement-sync";

interface PsnSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  npssoHash: string;
}

const authorizing = new Map<string, Promise<PsnSession>>();

export const psnRequest = async <T>(
  operation: string,
  request: () => Promise<T>,
): Promise<T> => {
  try {
    return await withRetry(request, { maxRetries: 2, baseDelayMs: 500 });
  } catch {
    throw new Error(
      `PSN_${operation}_FAILED: check authorization, account visibility and platform availability.`,
    );
  }
};

export const getPsnAuthorization = async (
  npsso: string,
): Promise<AuthorizationPayload> => {
  if (!npsso)
    throw new Error("PSN_AUTH_REQUIRED: configure psnNpsso on this service.");
  const npssoHash = createHash("sha256").update(npsso).digest("hex");
  let pending = authorizing.get(npssoHash);
  if (!pending) {
    pending = (async () => {
      const filename = path.join(
        SERVER_TEMPORARY_DIR,
        `psn-session-${npssoHash}.json`,
      );
      let saved: unknown;
      try {
        saved = JSON.parse(await readFile(filename, "utf8"));
      } catch (error) {
        if (!(
          error instanceof Error &&
          "code" in error &&
          error.code === "ENOENT"
        ))
          throw new Error(
            "PSN_SESSION_INVALID: remove the invalid private session and authorize again.",
          );
      }
      let previous: PsnSession | undefined;
      if (saved !== undefined) {
        if (!isPsnSession(saved) || saved.npssoHash !== npssoHash)
          throw new Error("PSN_SESSION_INVALID: authorize again.");
        previous = saved;
      }
      if (previous && previous.expiresAt > Date.now() + 60_000) return previous;
      const tokens = previous
        ? await psnRequest("REFRESH", () =>
            exchangeRefreshTokenForAuthTokens(previous.refreshToken),
          )
        : await psnRequest("AUTHORIZE", async () =>
            exchangeAccessCodeForAuthTokens(
              await exchangeNpssoForAccessCode(npsso),
            ),
          );
      const session = {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: Date.now() + tokens.expiresIn * 1000,
        npssoHash,
      };
      if (!isPsnSession(session)) throw new Error("PSN_AUTH_INVALID_RESPONSE");
      await mkdir(SERVER_TEMPORARY_DIR, { recursive: true });
      const temporary = `${filename}.${process.pid}.tmp`;
      await writeFile(temporary, JSON.stringify(session), { mode: 0o600 });
      await rename(temporary, filename);
      return session;
    })().finally(() => {
      authorizing.delete(npssoHash);
    });
    authorizing.set(npssoHash, pending);
  }
  return { accessToken: (await pending).accessToken };
};

const isPsnSession = (value: unknown): value is PsnSession =>
  typeof value === "object" &&
  value !== null &&
  "accessToken" in value &&
  typeof value.accessToken === "string" &&
  !!value.accessToken &&
  "refreshToken" in value &&
  typeof value.refreshToken === "string" &&
  !!value.refreshToken &&
  "npssoHash" in value &&
  typeof value.npssoHash === "string" &&
  "expiresAt" in value &&
  typeof value.expiresAt === "number" &&
  Number.isFinite(value.expiresAt);

export const collectPsnPages = async <T>(
  fetchPage: (offset: number) => Promise<{
    items: T[];
    totalItemCount: number;
    nextOffset?: number;
    trophySetVersion?: string;
  }>,
  expectedSetVersion?: string,
) => {
  const items: T[] = [];
  let offset = 0;
  let total: number | undefined;
  while (true) {
    const page = await fetchPage(offset);
    if (
      expectedSetVersion !== undefined &&
      page.trophySetVersion !== expectedSetVersion
    )
      throw new Error("PSN_TROPHY_SET_CHANGED: retry complete collection.");
    if (
      !Array.isArray(page.items) ||
      !Number.isInteger(page.totalItemCount) ||
      page.totalItemCount < 0 ||
      (total !== undefined && total !== page.totalItemCount)
    )
      throw new Error("PSN_PAGINATION_CHANGED: retry complete collection.");
    total = page.totalItemCount;
    items.push(...page.items);
    if (items.length === total) return items;
    if (
      !page.items.length ||
      items.length > total ||
      (page.nextOffset !== undefined &&
        page.nextOffset !== offset + page.items.length)
    )
      throw new Error("PSN_INCOMPLETE_PAGE");
    offset += page.items.length;
  }
};

const trophyCount = (counts: TrophyCounts) =>
  Object.values(counts).reduce((sum, n) => sum + n, 0);

export const getPsnAccountId = async (
  service: SyncServicePsnGameAchievement,
) => {
  if (service.accountId !== undefined) return service.accountId;
  const auth = await getPsnAuthorization(service.psnNpsso);
  const profile = await psnRequest("PROFILE", () =>
    getUserTrophyProfileSummary(auth, "me"),
  );
  if (typeof profile?.accountId !== "string")
    throw new Error("PSN_INVALID_PROFILE");
  return profile.accountId;
};

export const getPsnSummaries = async (
  npsso: string,
  accountId: string,
): Promise<GameSummary[]> => {
  const auth = await getPsnAuthorization(npsso);
  const titles = await collectPsnPages(async (offset) => {
    const page = await psnRequest("TITLES", () =>
      getUserTitles(auth, accountId, { offset, limit: 100 }),
    );
    return { ...page, items: page.trophyTitles };
  });
  return titles.map((title) => ({
    gameId: `${title.npServiceName}:${title.npCommunicationId}`,
    title: title.trophyTitleName,
    coverUrl: title.trophyTitleIconUrl,
    signature: achievementFingerprint([
      title.trophySetVersion,
      title.lastUpdatedDateTime,
      title.definedTrophies,
      title.earnedTrophies,
    ]),
  }));
};

export const getPsnDetails = async (
  npsso: string,
  accountId: string,
  summaries: GameSummary[],
): Promise<NormalizedGame[]> => {
  const auth = await getPsnAuthorization(npsso);
  const games: NormalizedGame[] = [];
  for (const summary of summaries) {
    const [npServiceName, npCommunicationId] = summary.gameId.split(":");
    if (
      (npServiceName !== "trophy" && npServiceName !== "trophy2") ||
      !npCommunicationId
    )
      throw new Error("PSN_INVALID_GAME_ID");
    const groups = await psnRequest("GROUPS", () =>
      getTitleTrophyGroups(auth, npCommunicationId, { npServiceName }),
    );
    if (typeof groups.trophySetVersion !== "string" || !groups.trophySetVersion)
      throw new Error("PSN_TROPHY_SET_VERSION_MISSING");
    const definitions: Trophy[] = [];
    const achievements: NormalizedGame["achievements"] = [];
    for (const group of groups.trophyGroups) {
      const groupId = group.trophyGroupId;
      const trophies = await collectPsnPages(async (offset) => {
        const page = await psnRequest("DEFINITIONS", () =>
          getTitleTrophies(auth, npCommunicationId, groupId, {
            npServiceName,
            offset,
            limit: 100,
          }),
        );
        return { ...page, items: page.trophies };
      }, groups.trophySetVersion);
      const earned = await collectPsnPages(async (offset) => {
        const page = await psnRequest("UNLOCKS", () =>
          getUserTrophiesEarnedForTitle(
            auth,
            accountId,
            npCommunicationId,
            groupId,
            { npServiceName, offset, limit: 100 },
          ),
        );
        return { ...page, items: page.trophies };
      }, groups.trophySetVersion);
      const byId = new Map(earned.map((trophy) => [trophy.trophyId, trophy]));
      if (
        trophies.length !== trophyCount(group.definedTrophies) ||
        byId.size !== trophies.length ||
        earned.length !== trophies.length
      )
        throw new Error("PSN_INCOMPLETE_TROPHIES");
      for (const trophy of trophies) {
        const unlock = byId.get(trophy.trophyId);
        if (!unlock || typeof unlock.earned !== "boolean")
          throw new Error("PSN_MISSING_UNLOCK_STATE");
        definitions.push(trophy);
        achievements.push({
          id: String(trophy.trophyId),
          groupId,
          unlocked: unlock.earned,
          unlockedAt: unlock.earnedDateTime,
        });
      }
    }
    if (achievements.length !== trophyCount(groups.definedTrophies))
      throw new Error("PSN_INCOMPLETE_GROUPS");
    const platinum = definitions.filter(
      (trophy) => trophy.trophyType === "platinum",
    );
    if (platinum.length > 1) throw new Error("PSN_AMBIGUOUS_PLATINUM");
    games.push({
      ...summary,
      achievements,
      base: platinum[0]
        ? { kind: "platinum", achievementId: String(platinum[0].trophyId) }
        : undefined,
    });
  }
  return games;
};

export const syncPsnGameAchievements = async (
  service: SyncServicePsnGameAchievement,
) => {
  const accountId = await getPsnAccountId(service);
  return syncGameAchievements(
    service,
    "psn",
    accountId,
    () => getPsnSummaries(service.psnNpsso, accountId),
    (games) => getPsnDetails(service.psnNpsso, accountId, games),
  );
};
