import { realpath } from "node:fs/promises";
import path from "node:path";

import type { SyncServiceXboxGameAchievement } from "../types/config";
import type { GameSummary, NormalizedGame } from "./achievement";
import { syncGameAchievements } from "./achievement-sync";

const serverRoot = path.resolve(import.meta.dir, "../..");
const queues = new Map<string, Promise<void>>();
const environmentError =
  "XBOX_ENVIRONMENT_UNAVAILABLE: prepare server/.venv with uv and requirements.txt.";

export const withXboxSession = async <T>(
  filename: string,
  collect: () => Promise<T>,
): Promise<T> => {
  let resolved: string;
  try {
    resolved = await realpath(filename);
  } catch {
    throw new Error(
      "XBOX_SESSION_NOT_FOUND: configure an absolute OAuth JSON path.",
    );
  }
  const key = process.platform === "win32" ? resolved.toLowerCase() : resolved;
  const work = (queues.get(key) ?? Promise.resolve()).then(collect);
  const tail = work.then(
    () => {},
    () => {},
  );
  queues.set(key, tail);
  try {
    return await work;
  } finally {
    if (queues.get(key) === tail) queues.delete(key);
  }
};

export const runXboxProcess = async (
  command: string[],
  request: unknown,
  timeoutMs: number,
): Promise<unknown> => {
  let child;
  try {
    child = Bun.spawn(command, {
      cwd: serverRoot,
      env: { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" },
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });
  } catch {
    throw new Error(environmentError);
  }
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill();
  }, timeoutMs);
  const stdout = new Response(child.stdout).text();
  const stderr = new Response(child.stderr).text();
  try {
    child.stdin.write(JSON.stringify(request));
    child.stdin.end();
    const [output, diagnostic, status] = await Promise.all([
      stdout,
      stderr,
      child.exited,
    ]);
    if (timedOut)
      throw new Error("XBOX_TIMEOUT: collector terminated and reaped.");
    if (status !== 0) {
      let code: unknown;
      try {
        const error: unknown = JSON.parse(diagnostic);
        if (isRecord(error)) code = error["code"];
      } catch {
        /* Discard unstructured upstream diagnostics. */
      }
      if (code === "XBOX_ENVIRONMENT_UNAVAILABLE")
        throw new Error(environmentError);
      const safeCodes = [
        "XBOX_AUTH_REQUIRED",
        "XBOX_RATE_LIMIT",
        "XBOX_REQUEST_FAILED",
        "XBOX_INCOMPLETE_RESPONSE",
        "XBOX_INVALID_REQUEST",
      ];
      throw new Error(
        typeof code === "string" && safeCodes.includes(code)
          ? code
          : "XBOX_COLLECTOR_FAILED",
      );
    }
    try {
      return JSON.parse(output);
    } catch {
      throw new Error("XBOX_INVALID_JSON");
    }
  } finally {
    clearTimeout(timer);
    if (child.exitCode === null) child.kill();
    await Promise.allSettled([child.exited, stdout, stderr]);
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isIdentity = (
  value: unknown,
): value is Pick<GameSummary, "gameId" | "title" | "url" | "coverUrl"> =>
  isRecord(value) &&
  typeof value["gameId"] === "string" &&
  /^(xboxone|xbox360):\d+$/.test(value["gameId"]) &&
  typeof value["title"] === "string" &&
  (value["url"] === undefined || typeof value["url"] === "string") &&
  (value["coverUrl"] === undefined || typeof value["coverUrl"] === "string");
const isSummary = (value: unknown): value is GameSummary =>
  isIdentity(value) &&
  "signature" in value &&
  typeof value.signature === "string";
const isGame = (value: unknown): value is NormalizedGame => {
  if (
    !isRecord(value) ||
    !isIdentity(value) ||
    !("achievements" in value) ||
    !Array.isArray(value.achievements)
  )
    return false;
  const achievements: unknown[] = value.achievements;
  if (
    !achievements.every(
      (a) =>
        isRecord(a) &&
        typeof a["id"] === "string" &&
        typeof a["unlocked"] === "boolean" &&
        (a["unlockedAt"] === undefined ||
          typeof a["unlockedAt"] === "string") &&
        (a["groupId"] === undefined || typeof a["groupId"] === "string"),
    )
  )
    return false;
  if (!("base" in value) || value.base === undefined) return true;
  return (
    isRecord(value.base) &&
    (value.base["kind"] === "mythic" ||
      value.base["kind"] === "base_completion") &&
    Array.isArray(value.base["achievementIds"]) &&
    value.base["achievementIds"].every((id: unknown) => typeof id === "string")
  );
};

interface XboxCatalog {
  xuid: string;
  summaries: GameSummary[];
}

export function parseXboxResult(
  operation: "summaries",
  value: unknown,
): XboxCatalog;
export function parseXboxResult(
  operation: "details",
  value: unknown,
  expected: GameSummary[],
): NormalizedGame[];
export function parseXboxResult(
  operation: "summaries" | "details",
  value: unknown,
  expected: GameSummary[] = [],
): XboxCatalog | NormalizedGame[] {
  if (!isRecord(value)) throw new Error("XBOX_INCOMPLETE_RESPONSE");
  if (operation === "summaries") {
    const { xuid, summaries } = value;
    if (
      typeof xuid === "string" &&
      /^\d+$/.test(xuid) &&
      Array.isArray(summaries) &&
      summaries.every(isSummary) &&
      new Set(summaries.map((s) => s.gameId)).size === summaries.length
    )
      return { xuid, summaries };
  } else {
    const games: unknown = value["games"];
    if (
      Array.isArray(games) &&
      games.every(isGame) &&
      games.length === expected.length &&
      new Set(games.map((g) => g.gameId)).size === expected.length &&
      expected.every((s) => games.some((g) => s.gameId === g.gameId))
    )
      return games;
  }
  throw new Error("XBOX_INCOMPLETE_RESPONSE");
}

const collectXbox = async (
  service: SyncServiceXboxGameAchievement,
  operation: "summaries" | "details",
  xuid: string | undefined,
  games: GameSummary[],
) => {
  const {
    xboxClientId: clientId,
    xboxClientSecret: clientSecret,
    xboxTokenStorePath: tokenStorePath,
  } = service;
  if (
    !clientId ||
    !clientSecret ||
    !tokenStorePath ||
    !path.isAbsolute(tokenStorePath)
  )
    throw new Error(
      "XBOX_AUTH_REQUIRED: configure a matching OAuth application and absolute session path on this service.",
    );
  const executable = path.join(
    serverRoot,
    ".venv",
    process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
  );
  return withXboxSession(tokenStorePath, () =>
    runXboxProcess(
      [executable, path.join(serverRoot, "python/xbox_collector.py")],
      { operation, xuid, clientId, clientSecret, tokenStorePath, games },
      120_000,
    ),
  );
};

export const getXboxSummaries = async (
  service: SyncServiceXboxGameAchievement,
) =>
  parseXboxResult(
    "summaries",
    await collectXbox(service, "summaries", service.xuid, []),
  );
export const getXboxDetails = async (
  service: SyncServiceXboxGameAchievement,
  xuid: string,
  games: GameSummary[],
) =>
  parseXboxResult(
    "details",
    await collectXbox(service, "details", xuid, games),
    games,
  );
export const syncXboxGameAchievements = async (
  service: SyncServiceXboxGameAchievement,
) => {
  const { xuid, summaries } =
    service.xuid === undefined
      ? await getXboxSummaries(service)
      : { xuid: service.xuid, summaries: undefined };
  return syncGameAchievements(
    service,
    "xbox",
    xuid,
    async () => summaries ?? (await getXboxSummaries(service)).summaries,
    (games) => getXboxDetails(service, xuid, games),
  );
};
