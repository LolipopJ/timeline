import "reflect-metadata";

import { SyncServiceType } from "@timeline/contracts";
import { afterAll, expect, mock, test } from "bun:test";
import schedule from "node-schedule";
import type { FindManyOptions, FindOptionsWhere } from "typeorm";
import { FindOperator } from "typeorm";

import type TimelineItem from "./database/entity/timeline-item";
import { createSyncCoordinator } from "./sync/coordinator";
import type { ServerConfig, SyncService } from "./types/config";
import { JWT } from "./utils/jwt";
import { runtimeLogs } from "./utils/runtime-logs";

const adminEnabled = process.env["ADMIN_TOOLS_DISABLED"] !== "1";
const config: ServerConfig = {
  services: [
    { id: "feed", type: SyncServiceType.FEED, url: "https://example.com" },
  ],
  database: {
    user: "test",
    password: "test",
    host: "localhost",
    port: 5432,
    database: "test",
  },
  admin: adminEnabled
    ? {
        secretKey: "test-only-secret",
        accounts: [{ username: "test", password: "test" }],
      }
    : undefined,
  syncInterval: "0 0 1 1 *",
};
const executions: SyncService[] = [];
let finish = () => {};
let work = Promise.resolve();
const coordinator = createSyncCoordinator(
  () => config.services,
  async (service) => {
    executions.push(service);
    await work;
  },
);
const initializeDatabase = mock(async () => {});
const destroyDatabase = mock(async () => {});
const items: TimelineItem[] = Array.from({ length: 12 }, (_, index) => ({
  id: `item-${index}`,
  content_id: String(index),
  sync_service_id: "feed",
  sync_service_type: SyncServiceType.FEED,
  title: index % 3 === 0 ? "public fixture" : "private-only fixture",
  content: "searchable body",
  is_secret: index % 3 !== 0,
  created_at: new Date(2026, 0, 12 - index),
  updated_at: new Date(2026, 0, 12 - index),
}));
const matches = (
  item: TimelineItem,
  condition: FindOptionsWhere<TimelineItem>,
) =>
  Object.entries(condition).every(([key, value]) => {
    if (value === undefined) return true;
    const field = Object.entries(item).find(([name]) => name === key)?.[1];
    return value instanceof FindOperator
      ? String(field ?? "").includes(String(value.value).replaceAll("%", ""))
      : field === value;
  });
const selectItems = (options: FindManyOptions<TimelineItem>) => {
  const conditions = Array.isArray(options.where)
    ? options.where
    : [options.where ?? {}];
  return items.filter((item) =>
    conditions.some((condition) => matches(item, condition)),
  );
};
mock.module("../configs/server", () => ({ default: config }));
mock.module("./sync", () => ({ syncCoordinator: coordinator }));
mock.module("./database", () => ({ initializeDatabase, destroyDatabase }));
mock.module("./database/controller/timeline-item", () => ({
  getTimelineItems: async (options: FindManyOptions<TimelineItem>) =>
    selectItems(options).slice(
      options.skip ?? 0,
      (options.skip ?? 0) + (options.take ?? 20),
    ),
  countTimelineItems: async (options: FindManyOptions<TimelineItem>) =>
    selectItems(options).length,
  updateTimelineItem: async () => ({}),
  softDeleteTimelineItem: async () => ({}),
  restoreSoftDeletedTimelineItem: async () => ({}),
}));
mock.module("./utils/file", () => ({ checkupDir: () => {} }));
process.env["FULL_SYNC"] = "true";
const { app } = await import("./index");
const token = new JWT("test-only-secret").sign({ username: "test" });
const request = (path: string, method = "GET", loggedIn = true) =>
  app.handle(
    new Request(`http://localhost${path}`, {
      method,
      headers: loggedIn ? { Cookie: `access-token=${token}` } : {},
    }),
  );
afterAll(async () => {
  finish();
  await coordinator.wait();
  for (const job of Object.values(schedule.scheduledJobs)) job.cancel();
});

test("management endpoints enforce real authentication before side effects", async () => {
  for (const method of ["GET", "POST"]) {
    const response = await request("/admin/sync", method, false);
    expect(response.status).toBe(adminEnabled ? 401 : 400);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  }
  const logs = await request("/admin/logs", "GET", false);
  expect(logs.status).toBe(adminEnabled ? 401 : 400);
  expect(logs.headers.get("cache-control")).toBe("private, no-store");
  expect(executions).toHaveLength(0);
  expect(coordinator.snapshot().current).toBeNull();
});

test("public reads filter before search, paging and counts, and admin view never grants permission", async () => {
  const publicResponse = await request(
    "/timeline-items?view=public&page=1&limit=2",
  );
  expect(publicResponse.headers.get("cache-control")).toBe("private, no-store");
  expect(await publicResponse.json()).toMatchObject([
    { id: "item-6", is_secret: false },
    { id: "item-9", is_secret: false },
  ]);
  const count = await request("/timeline-items/count?view=public");
  expect(count.headers.get("cache-control")).toBe("private, no-store");
  expect(await count.json()).toBe(4);
  for (const suffix of ["", "/count"]) {
    const secretSearch = await request(
      `/timeline-items${suffix}?view=public&search=private-only&serviceId=feed`,
    );
    expect(await secretSearch.json()).toEqual(suffix ? 0 : []);
    expect(
      (await request(`/timeline-items${suffix}?view=unknown`)).status,
    ).toBe(400);
  }
  expect(
    await (
      await request("/timeline-items/count?view=admin", "GET", false)
    ).json(),
  ).toBe(4);
  expect(await (await request("/timeline-items/count?view=admin")).json()).toBe(
    adminEnabled ? 12 : 4,
  );
  expect(await (await request("/timeline-items/count")).json()).toBe(
    adminEnabled ? 12 : 4,
  );
});

test("existing item mutation routes retain their authentication boundary", async () => {
  for (const [path, method] of [
    ["/timeline-items/fixture", "PATCH"],
    ["/timeline-items/fixture", "DELETE"],
    ["/timeline-items/fixture/restore", "POST"],
  ]) {
    const response = await request(path, method, false);
    expect(response.status).toBe(adminEnabled ? 401 : 400);
  }
});

test("invalid timeline pagination is rejected instead of returning an empty page", async () => {
  for (const query of [
    "limit=abc",
    "limit=101",
    "limit=0",
    "limit=1.5",
    "page=",
    "page=-1",
    "page=1.5",
    "page=9007199254740991&limit=2",
  ]) {
    expect((await request(`/timeline-items?${query}`)).status).toBe(400);
  }
});

if (adminEnabled) {
  test("log snapshots validate limits and combine filters before selecting the newest", async () => {
    for (let index = 0; index < 205; index++)
      runtimeLogs.append(
        index % 2 ? "info" : "error",
        "LogRouteFixture",
        `record ${index}`,
      );
    const response = await request("/admin/logs");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toHaveProperty("records.length", 100);
    const filtered = await request(
      "/admin/logs?level=error&module=LogRouteFixture&q=RECORD%202&limit=2",
    );
    expect(await filtered.json()).toMatchObject({
      records: [{ message: "record 204" }, { message: "record 202" }],
    });
    expect(await (await request("/admin/logs?q=not-present")).json()).toEqual({
      records: [],
    });
    for (const query of [
      "level=debug",
      "limit=0",
      "limit=201",
      "limit=1.5",
      "limit=not-a-number",
      "limit=",
    ]) {
      expect((await request(`/admin/logs?${query}`)).status).toBe(400);
    }
    expect(
      await (await request("/admin/logs?limit=200")).json(),
    ).toHaveProperty("records.length", 200);
  });

  test("POST returns 202 while work is pending, and refusals create no extra work", async () => {
    expect((await request("/admin/sync", "POST")).status).toBe(503);
    coordinator.ready();
    config.services[0].enabled = false;
    const empty = await request("/admin/sync", "POST");
    expect(empty.status).toBe(409);
    expect(await empty.json()).toEqual({ reason: "no_services" });
    expect(coordinator.snapshot().last).toBeNull();
    config.services[0].enabled = true;
    work = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const accepted = await request("/admin/sync", "POST");
    expect(accepted.status).toBe(202);
    const runId = coordinator.snapshot().current?.id;
    expect(runId).toBeString();
    expect(await accepted.json()).toEqual({ runId });
    const busy = await request("/admin/sync", "POST");
    expect(busy.status).toBe(409);
    expect(await busy.json()).toEqual({ reason: "busy", runId });
    expect(await (await request("/admin/sync")).json()).toHaveProperty(
      "current.id",
      runId,
    );
    expect(executions).toHaveLength(1);
    finish();
    await coordinator.wait();
    expect(await (await request("/admin/sync")).json()).toHaveProperty(
      "last.status",
      "succeeded",
    );
  });

  test("startup full sync, scheduling and shutdown share the coordinator", async () => {
    const countBeforeStartup = executions.length;
    app.listen(0);
    // Elysia's async onStart hook is not awaited by listen().
    for (
      let attempt = 0;
      attempt < 100 && !Object.keys(schedule.scheduledJobs).length;
      attempt++
    ) {
      await Bun.sleep(10);
    }
    expect(initializeDatabase).toHaveBeenCalledTimes(1);
    expect(executions.length).toBe(countBeforeStartup + 1);
    expect(executions.at(-1)?.full).toBe(true);
    expect(coordinator.snapshot().last?.trigger).toBe("startup");
    const job = Object.values(schedule.scheduledJobs)[0];
    expect(job).toBeDefined();
    work = new Promise<void>((resolve) => {
      finish = resolve;
    });
    job.invoke();
    expect(coordinator.start("manual")).toHaveProperty("reason", "busy");
    const stopped = app.stop();
    await stopped;
    expect(coordinator.snapshot().reason).toBe("stopping");
    expect(destroyDatabase).not.toHaveBeenCalled();
    finish();
    await coordinator.wait();
    for (
      let attempt = 0;
      attempt < 100 && !destroyDatabase.mock.calls.length;
      attempt++
    )
      await Bun.sleep(10);
    expect(destroyDatabase).toHaveBeenCalledTimes(1);
  });
}
