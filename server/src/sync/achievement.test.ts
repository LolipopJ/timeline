import { describe, expect, test } from "bun:test";

import {
  calculateMilestones,
  type NormalizedGame,
  selectAchievementGames,
} from "./achievement";

const early = "2020-01-01T00:00:00.000Z";
const later = "2021-01-01T00:00:00.000Z";
const game: NormalizedGame = {
  gameId: "trophy2:NPWR00001_00",
  title: "Game",
  achievements: [
    { id: "1", unlocked: true, unlockedAt: early, groupId: "default" },
    { id: "0", unlocked: true, unlockedAt: later, groupId: "default" },
  ],
  base: { kind: "platinum", achievementId: "0" },
};

describe("achievement evidence", () => {
  test("real platinum merges with the full set it completes", () => {
    const milestones = calculateMilestones("psn", "001", game);
    expect(
      milestones.map((m) => [m.slot, m.achievement.kind, m.merged]),
    ).toEqual([
      ["base", "platinum", false],
      ["all", "all_achievements", true],
    ]);
    expect(milestones[0]?.createdAt).toBe(later);
    expect(milestones[0]?.achievement.totalCount).toBe(2);
  });

  test("no base evidence and empty collections cannot invent a base milestone", () => {
    expect(
      calculateMilestones("steam", "1", { ...game, base: undefined }).map(
        (m) => m.slot,
      ),
    ).toEqual(["all"]);
    expect(
      calculateMilestones("steam", "1", {
        ...game,
        base: undefined,
        achievements: [],
      }),
    ).toEqual([]);
  });

  test("unknown and placeholder dates cannot produce all achievements", () => {
    for (const unlockedAt of [
      undefined,
      "invalid",
      "1970-01-01T00:00:00Z",
      "0001-01-01T00:00:00Z",
      "2020",
      "2020-02-30T00:00:00Z",
      "2020-01-01T24:00:00Z",
    ]) {
      const incomplete = {
        ...game,
        base: undefined,
        achievements: [{ id: "1", unlocked: true, unlockedAt }],
      };
      expect(calculateMilestones("steam", "1", incomplete)).toEqual([]);
    }
  });

  test("equal seconds with a separate DLC unlock are not proof of the same event", () => {
    const dlc = {
      ...game,
      achievements: [
        ...game.achievements,
        { id: "2", unlocked: true, unlockedAt: later, groupId: "001" },
      ],
    };
    expect(calculateMilestones("psn", "1", dlc).at(-1)?.merged).toBe(false);
  });

  test("append completion keeps stable identities and moves only the all date", () => {
    const first = calculateMilestones("psn", "1", game);
    const updated = calculateMilestones("psn", "1", {
      ...game,
      achievements: [
        ...game.achievements,
        {
          id: "2",
          unlocked: true,
          unlockedAt: "2022-01-01T00:00:00Z",
          groupId: "001",
        },
      ],
    });
    expect(updated.map((m) => m.contentId)).toEqual(
      first.map((m) => m.contentId),
    );
    expect(updated[0]?.createdAt).toBe(first[0]?.createdAt);
    expect(updated[1]?.createdAt).toBe("2022-01-01T00:00:00.000Z");
    expect(updated[1]?.merged).toBe(false);
    expect(
      calculateMilestones("psn", "1", {
        ...game,
        achievements: [...game.achievements, { id: "2", unlocked: false }],
      }).map((m) => m.slot),
    ).toEqual(["base"]);
  });

  test("platform, account and collection identity are independent of display name", () => {
    const ids = [
      calculateMilestones("psn", "1", game)[0]?.contentId,
      calculateMilestones("xbox", "1", game)[0]?.contentId,
      calculateMilestones("psn", "2", game)[0]?.contentId,
      calculateMilestones("psn", "1", {
        ...game,
        gameId: "trophy:NPWR00001_00",
      })[0]?.contentId,
    ];
    expect(new Set(ids).size).toBe(4);
    expect(calculateMilestones("psn", "0001", game)[0]?.contentId).toBe(ids[0]);
  });

  test("verified base groups work, with no inference from names or scores", () => {
    const grouped: NormalizedGame = {
      ...game,
      base: { kind: "mythic", achievementIds: ["0", "1"] },
    };
    expect(calculateMilestones("xbox", "1", grouped)[0]?.achievement.kind).toBe(
      "mythic",
    );
    expect(calculateMilestones("xbox", "1", grouped)[1]?.merged).toBe(true);
  });

  test("platinum never labels later base additions as achieved-at counts", () => {
    const milestones = calculateMilestones("psn", "1", {
      ...game,
      achievements: [
        ...game.achievements,
        {
          id: "added-later",
          groupId: "default",
          unlocked: true,
          unlockedAt: "2022-01-01T00:00:00Z",
        },
      ],
    });
    expect(milestones[0]?.achievement.kind).toBe("platinum");
    expect(milestones[0]?.achievement.totalCount).toBeUndefined();
    expect(milestones[1]?.achievement.totalCount).toBe(3);
  });
});

test("bounded persisted rotation discovers unchanged old titles and full rechecks all", () => {
  const summaries = Array.from({ length: 13 }, (_, i) => ({
    gameId: String(i).padStart(2, "0"),
    title: "Game",
    signature: "unchanged",
  }));
  const seen = new Set<string>();
  let cursor: string | null = null;
  for (let round = 0; round < 3; round++) {
    const selection = selectAchievementGames(
      summaries,
      summaries,
      cursor,
      false,
    );
    expect(selection.games.length).toBeLessThanOrEqual(5);
    selection.games.forEach((g) => seen.add(g.gameId));
    cursor = selection.cursor;
  }
  expect(seen.size).toBe(13);
  for (const full of [false, true]) {
    expect(
      selectAchievementGames(
        summaries.slice(1),
        summaries,
        null,
        full,
      ).games.some((game) => game.gameId === "00"),
    ).toBe(false);
    expect(selectAchievementGames([], summaries, cursor, full).games).toEqual(
      [],
    );
  }
  expect(
    selectAchievementGames(summaries, summaries, cursor, true).games.length,
  ).toBe(13);
  expect(selectAchievementGames(summaries, [], null, false).games.length).toBe(
    13,
  );
  const changed = summaries.map((s) =>
    s.gameId === "12" ? { ...s, signature: "new" } : s,
  );
  expect(
    selectAchievementGames(changed, summaries, null, false).games.some(
      (s) => s.gameId === "12",
    ),
  ).toBe(true);
});
