import "reflect-metadata";

import { SyncServiceType } from "@timeline/contracts";
import { afterAll, expect, mock, spyOn, test } from "bun:test";
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
    return 3;
  },
);
const initializeDatabase = mock(async () => {});
const destroyDatabase = mock(async () => {});
const secretItemId = "6f1e6c1a-6a1f-4b0e-8f3f-2a1e3f6c9d10";
const items: TimelineItem[] = Array.from({ length: 12 }, (_, index) => ({
  id: index === 1 ? secretItemId : `item-${index}`,
  content_id: String(index),
  sync_service_id: "feed",
  sync_service_type: SyncServiceType.FEED,
  title: index % 3 === 0 ? "public fixture" : "private-only fixture",
  content: "searchable body",
  is_secret: index % 3 !== 0,
  achievement_merged: false,
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
  return items.filter(
    (item) =>
      !item.deleted_at &&
      conditions.some((condition) => matches(item, condition)),
  );
};
mock.module("./config", () => ({ default: config }));
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
  getTimelineServiceIds: async (options: FindManyOptions<TimelineItem>) => [
    ...new Set(selectItems(options).map((item) => item.sync_service_id)),
  ],
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

test("ID filtering preserves visibility and intersects both keyword branches before counts", async () => {
  for (const suffix of ["", "/count"]) {
    const path = `/timeline-items${suffix}?id=${secretItemId}`;
    for (const [query, loggedIn] of [
      ["&view=admin", false],
      ["&view=public", true],
      ["&view=public&search=fixture", true],
    ] as const) {
      const response = await request(path + query, "GET", loggedIn);
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(await response.json()).toEqual(suffix ? 0 : []);
    }
    for (const search of ["", "fixture", "searchable"]) {
      const response = await request(`${path}&view=admin&search=${search}`);
      const result = await response.json();
      if (suffix) expect(result).toBe(adminEnabled ? 1 : 0);
      else
        expect(result).toEqual(
          adminEnabled ? [expect.objectContaining({ id: secretItemId })] : [],
        );
    }
    expect(
      await (await request(`${path}&search=does-not-match`)).json(),
    ).toEqual(suffix ? 0 : []);
    expect(await (await request(`${path}&serviceId=other`)).json()).toEqual(
      suffix ? 0 : [],
    );
    const missing = await request(
      `/timeline-items${suffix}?id=00000000-0000-4000-8000-000000000000`,
    );
    expect(missing.status).toBe(200);
    expect(await missing.json()).toEqual(suffix ? 0 : []);
    for (const id of ["", "hello", `${secretItemId}x`]) {
      const invalid = await request(`/timeline-items${suffix}?id=${id}`);
      expect(invalid.status).toBe(400);
      expect(invalid.headers.get("cache-control")).toBe("private, no-store");
    }
  }
});

test("the public service catalog exposes only IDs even without administrator access", async () => {
  const response = await request("/timeline-services", "GET", false);
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).toEqual(["feed"]);
});

test("service catalog includes stored sources within the same visibility and soft-delete boundary", async () => {
  const original = [
    items[0].sync_service_id,
    items[1].sync_service_id,
    items[3].sync_service_id,
  ];
  items[0].sync_service_id = "retired-public";
  items[1].sync_service_id = "retired-private";
  items[3].sync_service_id = "retired-deleted";
  items[3].deleted_at = new Date();
  try {
    for (const [view, loggedIn] of [
      ["public", true],
      ["admin", false],
      ["admin", true],
    ] as const) {
      const response = await request(
        `/timeline-services?view=${view}`,
        "GET",
        loggedIn,
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      const ids = await response.json();
      expect(ids).toEqual([
        "feed",
        "retired-public",
        ...(adminEnabled && loggedIn && view === "admin"
          ? ["retired-private"]
          : []),
      ]);
    }
    expect((await request("/timeline-services?view=unknown")).status).toBe(400);
  } finally {
    [
      items[0].sync_service_id,
      items[1].sync_service_id,
      items[3].sync_service_id,
    ] = original;
    delete items[3].deleted_at;
  }
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
    expect(coordinator.snapshot().history).toEqual([]);
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
    const status = await (await request("/admin/sync")).json();
    expect(status).toHaveProperty("history.0.status", "succeeded");
    expect(status).toHaveProperty("history.0.services.0.itemCount", 3);
  });

  test("startup full sync, scheduling and shutdown share the coordinator", async () => {
    config.services.push({
      id: "custom-schedule",
      type: SyncServiceType.FEED,
      url: "https://example.com",
      syncInterval: "0 0 1 2 *",
    });
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
    expect(
      executions
        .slice(countBeforeStartup)
        .map(({ id, full }) => ({ id, full })),
    ).toEqual([
      { id: "feed", full: true },
      { id: "custom-schedule", full: true },
    ]);
    expect(coordinator.snapshot().history[0]?.trigger).toBe("startup");
    const jobs = Object.values(schedule.scheduledJobs);
    expect(jobs).toHaveLength(2);
    const defaultJob = jobs.find(
      (job) => job.nextInvocation()?.getMonth() === 0,
    )!;
    const customJob = jobs.find(
      (job) => job.nextInvocation()?.getMonth() === 1,
    )!;
    const customDate = customJob.nextInvocation()!;
    Reflect.apply(customJob.invoke, customJob, [customDate]);
    await coordinator.wait();
    expect(
      coordinator.snapshot().history[0]?.services.map(({ id }) => id),
    ).toEqual(["custom-schedule"]);

    // The second callback may arrive after the combined run has finished.
    const sharedDate = defaultJob.nextInvocation()!;
    const nextInvocation = spyOn(
      customJob,
      "nextInvocation",
    ).mockReturnValueOnce(sharedDate);
    Reflect.apply(defaultJob.invoke, defaultJob, [sharedDate]);
    nextInvocation.mockRestore();
    expect(
      coordinator.snapshot().current?.services.map(({ id }) => id),
    ).toEqual(["feed", "custom-schedule"]);
    await coordinator.wait();
    Reflect.apply(customJob.invoke, customJob, [sharedDate]);
    expect(coordinator.snapshot().current).toBeNull();

    work = new Promise<void>((resolve) => {
      finish = resolve;
    });
    Reflect.apply(defaultJob.invoke, defaultJob, [
      new Date(sharedDate.getTime() + 1000),
    ]);
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
