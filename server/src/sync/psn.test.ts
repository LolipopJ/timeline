import { createHash, randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { expect, spyOn, test } from "bun:test";

import { SERVER_TEMPORARY_DIR } from "../constants";
import { collectPsnPages, getPsnAuthorization } from "./psn";

test("concurrent PSN tasks reuse only the session for their own NPSSO", async () => {
  const sessions = ["first-access", "second-access"].map((accessToken) => {
    const npsso = randomUUID();
    const npssoHash = createHash("sha256").update(npsso).digest("hex");
    return {
      npsso,
      npssoHash,
      accessToken,
      filename: path.join(
        SERVER_TEMPORARY_DIR,
        `psn-session-${npssoHash}.json`,
      ),
    };
  });
  const fetch = spyOn(globalThis, "fetch").mockRejectedValue(
    new Error("An unexpired saved session needs no authorization request."),
  );
  try {
    await mkdir(SERVER_TEMPORARY_DIR, { recursive: true });
    await Promise.all(
      sessions.map(({ filename, npssoHash, accessToken }) =>
        writeFile(
          filename,
          JSON.stringify({
            npssoHash,
            accessToken,
            refreshToken: "test-refresh",
            expiresAt: Date.now() + 300_000,
          }),
        ),
      ),
    );
    expect(
      await Promise.all(
        sessions.map(({ npsso }) => getPsnAuthorization(npsso)),
      ),
    ).toEqual([
      { accessToken: "first-access" },
      { accessToken: "second-access" },
    ]);
  } finally {
    fetch.mockRestore();
    await Promise.all(
      sessions.map(({ filename }) => rm(filename, { force: true })),
    );
  }
});

test("PSN pagination consumes every page and rejects incomplete or changing totals", async () => {
  const offsets: number[] = [];
  expect(
    await collectPsnPages(async (offset) => {
      offsets.push(offset);
      return offset === 0
        ? { items: [1, 2], totalItemCount: 3, nextOffset: 2 }
        : { items: [3], totalItemCount: 3 };
    }),
  ).toEqual([1, 2, 3]);
  expect(offsets).toEqual([0, 2]);
  expect(
    await collectPsnPages(async () => ({ items: [], totalItemCount: 0 })),
  ).toEqual([]);
  await expect(
    collectPsnPages(async () => ({ items: [], totalItemCount: 3 })),
  ).rejects.toThrow("INCOMPLETE");
  await expect(
    collectPsnPages(async (offset) => ({
      items: [offset],
      totalItemCount: offset ? 3 : 2,
    })),
  ).rejects.toThrow("CHANGED");
  await expect(
    collectPsnPages(
      async () => ({
        items: [1],
        totalItemCount: 1,
        trophySetVersion: "01.01",
      }),
      "01.00",
    ),
  ).rejects.toThrow("PSN_TROPHY_SET_CHANGED");
});
