import { createHash } from "node:crypto";

import type { GameAchievementDto } from "@timeline/contracts";

export interface GameSummary {
  gameId: string;
  title: string;
  url?: string;
  coverUrl?: string;
  signature: string;
}

export interface NormalizedGame {
  gameId: string;
  title: string;
  url?: string;
  coverUrl?: string;
  achievements: {
    id: string;
    unlocked: boolean;
    unlockedAt?: string;
    groupId?: string;
  }[];
  base?:
    | { kind: "platinum"; achievementId: string }
    | { kind: "mythic" | "base_completion"; achievementIds: string[] };
}

export interface AchievementMilestone {
  slot: "base" | "all";
  contentId: string;
  createdAt: string;
  achievement: GameAchievementDto;
  merged: boolean;
}

export const normalizeAchievementAccount = (account: string) => {
  if (!/^\d+$/.test(account))
    throw new Error("Achievement account must be a numeric platform ID.");
  return BigInt(account).toString();
};

export const achievementFingerprint = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

export const validUnlockDate = (value?: string) => {
  if (!value) return undefined;
  if (
    !/^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(
      value,
    )
  )
    return undefined;
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (day! > new Date(Date.UTC(year!, month!, 0)).getUTCDate())
    return undefined;
  const time = Date.parse(value);
  // Xbox/Steam/PSN achievements postdate 2000. Reject epoch and sentinel dates.
  return Number.isFinite(time) &&
    time >= Date.UTC(2000, 0, 1) &&
    time <= Date.now()
    ? new Date(time).toISOString()
    : undefined;
};

export const calculateMilestones = (
  platform: GameAchievementDto["platform"],
  account: string,
  game: NormalizedGame,
): AchievementMilestone[] => {
  const result: AchievementMilestone[] = [];
  const all = game.achievements;
  const byId = new Map(all.map((a) => [a.id, a]));
  if (byId.size !== all.length)
    throw new Error("Duplicate achievement definitions.");
  const identity = [
    platform,
    normalizeAchievementAccount(account),
    game.gameId,
  ];
  const finish = (set: typeof all) => {
    if (
      !set.length ||
      set.some((a) => !a.unlocked || !validUnlockDate(a.unlockedAt))
    )
      return undefined;
    return new Date(
      Math.max(...set.map((a) => Date.parse(a.unlockedAt!))),
    ).toISOString();
  };
  const add = (
    slot: AchievementMilestone["slot"],
    kind: GameAchievementDto["kind"],
    date: string,
    set: typeof all,
    merged = false,
  ) => {
    const countsKnown = set.every(
      (a) =>
        a.unlocked &&
        !!validUnlockDate(a.unlockedAt) &&
        Date.parse(a.unlockedAt!) <= Date.parse(date),
    );
    result.push({
      slot,
      contentId: JSON.stringify([...identity, slot]),
      createdAt: date,
      merged,
      achievement: {
        platform,
        gameId: game.gameId,
        kind,
        earnedCount: countsKnown ? set.length : undefined,
        totalCount: countsKnown ? set.length : undefined,
      },
    });
  };

  let baseDate: string | undefined;
  let baseIds = new Set<string>();
  const evidence = game.base;
  if (evidence?.kind === "platinum") {
    const platinum = byId.get(evidence.achievementId);
    if (platinum?.unlocked) {
      baseDate = validUnlockDate(platinum.unlockedAt);
      const group = platinum.groupId;
      const baseSet =
        group === undefined
          ? [platinum]
          : all.filter((a) => a.groupId === group);
      baseIds = new Set(baseSet.map((a) => a.id));
      if (baseDate) add("base", "platinum", baseDate, baseSet);
    }
  } else if (evidence) {
    const baseSet = evidence.achievementIds.flatMap((id) => byId.get(id) ?? []);
    baseIds = new Set(evidence.achievementIds);
    if (
      baseSet.length === baseIds.size &&
      baseSet.length === evidence.achievementIds.length
    ) {
      baseDate = finish(baseSet);
      if (baseDate) add("base", evidence.kind, baseDate, baseSet);
    }
  }

  const allDate = finish(all);
  if (allDate) {
    const sameSet =
      baseIds.size === all.length && all.every((a) => baseIds.has(a.id));
    const platinumIsLast =
      evidence?.kind === "platinum" &&
      all.every(
        (a) =>
          a.id === evidence.achievementId ||
          baseIds.has(a.id) ||
          Date.parse(a.unlockedAt!) < Date.parse(baseDate ?? ""),
      );
    add(
      "all",
      "all_achievements",
      allDate,
      all,
      !!baseDate && baseDate === allDate && (sameSet || platinumIsLast),
    );
  }
  return result;
};

export const selectAchievementGames = (
  current: GameSummary[],
  previous: GameSummary[],
  cursor: string | null,
  full: boolean,
) => {
  const old = new Map(previous.map((s) => [s.gameId, s]));
  const sorted = [...current].sort((a, b) =>
    a.gameId.localeCompare(b.gameId, "en"),
  );
  if (!sorted.length) return { games: [], cursor: null };
  const nextIndex =
    cursor === null
      ? 0
      : sorted.findIndex((s) => s.gameId.localeCompare(cursor, "en") > 0);
  const start = nextIndex < 0 ? 0 : nextIndex;
  const rotated = Array.from(
    { length: Math.min(5, sorted.length) },
    (_, i) => sorted[(start + i) % sorted.length]!,
  );
  const changed = current.filter(
    (s) => old.get(s.gameId)?.signature !== s.signature,
  );
  return {
    games: full
      ? sorted
      : [
          ...new Map(
            [...changed, ...rotated].map((s) => [s.gameId, s]),
          ).values(),
        ],
    cursor: rotated.at(-1)!.gameId,
  };
};
