import { expect, setSystemTime, test } from "bun:test";

import { createRuntimeLogBuffer } from "./runtime-logs";

test("only the newest 500 safe messages are kept, with bounded messages and immutable snapshots", () => {
  const buffer = createRuntimeLogBuffer();
  for (let index = 0; index < 510; index++)
    buffer.append("info", "Sync", `record ${index}`);
  const records = buffer.read({ limit: 200 }).records;
  expect(records).toHaveLength(200);
  expect(records[0].id).toBe(510);
  expect(records.at(-1)?.id).toBe(311);
  expect(buffer.read({ q: "record 9" }).records).toHaveLength(10);
  const long = buffer.append("error", "Server", "x".repeat(5000));
  expect(long.message).toHaveLength(4096);
  expect(long.message).toEndWith("[已截断]");
  expect(
    buffer
      .read({ level: "info", module: "Sync", q: "RECORD 50", limit: 3 })
      .records.map((record) => record.message),
  ).toEqual(["record 509", "record 508", "record 507"]);
  expect(buffer.read({ module: "sync" }).records).toHaveLength(0);
  records[0].message = "changed";
  expect(buffer.read({ limit: 200 }).records[0].message).not.toBe("changed");
  expect(createRuntimeLogBuffer().read().records).toEqual([]);
});

test("log timestamps determine recency and later writes break ties", () => {
  const buffer = createRuntimeLogBuffer();
  try {
    setSystemTime(new Date("2026-11-04T01:00:00Z"));
    buffer.append("info", "Sync", "first at one");
    buffer.append("info", "Sync", "second at one");
    setSystemTime(new Date("2026-11-04T00:00:00Z"));
    buffer.append("info", "Sync", "earlier timestamp");

    expect(
      buffer.read({ limit: 2 }).records.map((record) => record.id),
    ).toEqual([2, 1]);
  } finally {
    setSystemTime();
  }
});
