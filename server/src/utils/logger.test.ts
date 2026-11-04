import { afterAll, afterEach, expect, spyOn, test } from "bun:test";

import { createLogger, formatError } from "./logger";
import { runtimeLogs } from "./runtime-logs";

const output = spyOn(console, "error").mockImplementation(() => {});
afterEach(() => output.mockClear());
afterAll(() => output.mockRestore());

test("console and retained messages share redaction before truncation", () => {
  const logger = createLogger("SecurityTest");
  const nested = Object.assign(new Error("password=message-secret"), {
    code: "ECONNREFUSED",
    config: {
      method: "get",
      url: "https://private-user:private-password@example.com/feed?secret=query-secret",
    },
    response: { status: 403, data: { token: "response-secret" } },
    cause: new Error("api_key=cause-secret"),
  });
  logger.error(
    "access_token=message-token Authorization: Bearer header-secret\nCookie: skey=cookie-secret; p_skey=other-cookie\nhttps://feed-user:feed-password@feed.example.com/feed?page=2&private=feed-secret#fragment-secret",
    {
      password: "argument-secret",
      nested: { sessionId: "session-secret", apiKey: "api-secret" },
      ok: "diagnostic-ok",
    },
    new AggregateError([nested], "token=aggregate-secret"),
  );
  const record = runtimeLogs.read({ module: "SecurityTest" }).records.at(-1)!;
  expect(output.mock.calls.at(-1)).toEqual([
    `❌ [SecurityTest] ${record.message}`,
  ]);
  for (const secret of [
    "message-secret",
    "private-user",
    "private-password",
    "query-secret",
    "response-secret",
    "cause-secret",
    "message-token",
    "header-secret",
    "cookie-secret",
    "other-cookie",
    "feed-user",
    "feed-password",
    "feed-secret",
    "fragment-secret",
    "argument-secret",
    "session-secret",
    "api-secret",
    "aggregate-secret",
  ])
    expect(record.message).not.toContain(secret);
  for (const diagnostic of [
    "ECONNREFUSED",
    "403",
    "diagnostic-ok",
    "example.com/feed",
    "page=2",
  ])
    expect(record.message).toContain(diagnostic);
  expect(formatError(new Error("password=direct-secret"))).not.toContain(
    "direct-secret",
  );
  logger.error(`token=${"private".repeat(1000)}\nnormal diagnostic`);
  expect(
    runtimeLogs.read({ module: "SecurityTest" }).records.at(-1)!.message,
  ).toContain("normal diagnostic");
});
