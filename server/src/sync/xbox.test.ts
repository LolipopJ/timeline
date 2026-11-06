import { expect, test } from "bun:test";

import { parseXboxResult, runXboxProcess, withXboxSession } from "./xbox";

test("Xbox transport drains streams, rejects unsafe errors and waits for timeout termination", async () => {
  const command = (code: string) => [process.execPath, "-e", code];
  expect(
    await runXboxProcess(
      command(
        'console.log(JSON.stringify({ok: (await Bun.stdin.text()).includes("secret")}))',
      ),
      { value: "secret" },
      5000,
    ),
  ).toEqual({ ok: true });
  await expect(
    runXboxProcess(
      command(
        'console.error(JSON.stringify({code:"XBOX_AUTH_REQUIRED",message:"sensitive secret"})); process.exit(1)',
      ),
      {},
      5000,
    ),
  ).rejects.toThrow("XBOX_AUTH_REQUIRED");
  await expect(
    runXboxProcess(
      command(
        'console.error(JSON.stringify({code:"XBOX_ENVIRONMENT_UNAVAILABLE"})); process.exit(1)',
      ),
      {},
      5000,
    ),
  ).rejects.toThrow("XBOX_ENVIRONMENT_UNAVAILABLE");
  await expect(
    runXboxProcess(
      command('console.error("refresh_token=secret"); process.exit(3)'),
      {},
      5000,
    ),
  ).rejects.toThrow("XBOX_COLLECTOR_FAILED");
  await expect(
    runXboxProcess(command('console.log("broken")'), {}, 5000),
  ).rejects.toThrow("XBOX_INVALID_JSON");
  await expect(
    runXboxProcess(command("await Bun.sleep(5000)"), {}, 50),
  ).rejects.toThrow("XBOX_TIMEOUT");
  expect(
    parseXboxResult("summaries", { xuid: "9007199254740993", summaries: [] }),
  ).toEqual({
    xuid: "9007199254740993",
    summaries: [],
  });
  expect(() =>
    parseXboxResult("summaries", { xuid: "123", summaries: [{ gameId: "1" }] }),
  ).toThrow("XBOX_INCOMPLETE");
  expect(() =>
    parseXboxResult("details", { games: [] }, [
      { gameId: "xboxone:1", title: "Game", signature: "v1" },
    ]),
  ).toThrow("XBOX_INCOMPLETE");
}, 20_000);

test("same Xbox session serializes and releases its queue after a failed request", async () => {
  const order: string[] = [];
  let started = () => {};
  const firstStarted = new Promise<void>((resolve) => {
    started = resolve;
  });
  const first = withXboxSession(import.meta.filename, async () => {
    order.push("first");
    started();
    await Bun.sleep(20);
    order.push("first finished");
    throw new Error("failed");
  });
  // Filesystem canonicalization is asynchronous; queue the next call while the first holds the session.
  await firstStarted;
  const second = withXboxSession(import.meta.filename, async () => {
    order.push("second");
    return 2;
  });
  const outcomes = await Promise.allSettled([first, second]);
  expect(order).toEqual(["first", "first finished", "second"]);
  expect(outcomes.map((o) => o.status)).toEqual(["rejected", "fulfilled"]);
  expect(await withXboxSession(import.meta.filename, async () => 3)).toBe(3);
});
