import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { SyncRunDto } from "@timeline/contracts";
import { SyncServiceType } from "@timeline/contracts";

async function backend(page: Page) {
  page.on("pageerror", (error) =>
    console.error(`Browser error: ${error.message}`),
  );
  const state = {
    loggedIn: true,
    failLogout: false,
    expireLogs: false,
    expireSync: false,
    loseAcceptance: false,
    multiPage: false,
    logCount: 1,
    loginGate: null as Promise<void> | null,
    timelineGate: null as Promise<void> | null,
    logsGate: null as Promise<void> | null,
    run: null as SyncRunDto | null,
    history: [] as SyncRunDto[],
    requests: [] as {
      path: string;
      method: string;
      view: string | null;
      page: string | null;
      search: string | null;
      serviceId: string | null;
      orderBy: string | null;
    }[],
  };
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (
      ![
        "/login",
        "/logout",
        "/timeline-items",
        "/timeline-items/count",
        "/admin/sync",
        "/admin/logs",
      ].includes(path) &&
      !/^\/timeline-items\/[^/]+$/.test(path)
    )
      return route.continue();
    state.requests.push({
      path,
      method: request.method(),
      view: url.searchParams.get("view"),
      page: url.searchParams.get("page"),
      search: url.searchParams.get("search"),
      serviceId: url.searchParams.get("serviceId"),
      orderBy: url.searchParams.get("orderBy"),
    });
    const headers = {
      "access-control-allow-origin": "http://127.0.0.1:3100",
      "access-control-allow-credentials": "true",
      "access-control-allow-headers": "content-type",
      "access-control-allow-methods": "GET, POST, PATCH, OPTIONS",
      "cache-control": "private, no-store",
    };
    if (request.method() === "OPTIONS")
      return route.fulfill({ status: 204, headers });
    if (request.method() === "PATCH" && path.startsWith("/timeline-items/"))
      return route.fulfill({ json: {}, headers });
    if (path === "/login") {
      if (request.method() === "POST") {
        state.loggedIn = true;
        return route.fulfill({ json: "您已登录", headers });
      }
      const isLoggedIn = state.loggedIn;
      await state.loginGate;
      return route.fulfill({ json: { isLoggedIn }, headers });
    }
    if (path === "/logout") {
      if (state.failLogout)
        return route.fulfill({ status: 500, body: "failed", headers });
      state.loggedIn = false;
      return route.fulfill({ json: "您已登出", headers });
    }
    if (path === "/admin/sync") {
      if (state.expireSync) {
        state.loggedIn = false;
        return route.fulfill({ status: 401, body: "expired", headers });
      }
      if (request.method() === "POST") {
        state.run = {
          id: "test-run",
          trigger: "manual",
          startedAt: new Date().toISOString(),
          finishedAt: null,
          status: "running",
          services: [
            { id: "feed", type: SyncServiceType.FEED, status: "running" },
          ],
        };
        if (state.loseAcceptance) return route.abort("failed");
        return route.fulfill({
          status: 202,
          json: { runId: state.run.id },
          headers,
        });
      }
      return route.fulfill({
        json: {
          available: state.run?.status !== "running",
          reason: state.run?.status === "running" ? "busy" : null,
          current: state.run?.status === "running" ? state.run : null,
          history: [
            ...(state.run?.finishedAt ? [state.run] : []),
            ...state.history,
          ],
        },
        headers,
      });
    }
    if (path === "/admin/logs") {
      if (state.expireLogs) {
        state.loggedIn = false;
        return route.fulfill({ status: 401, body: "expired", headers });
      }
      const records = Array.from({ length: state.logCount }, (_, index) => ({
        id: index + 1,
        timestamp: "2026-11-03T01:00:00.000Z",
        level: "error",
        module: "Sync",
        message: '<img src=x onerror="window.logInjected=true"> LOG-MARKER',
      })).filter(
        (record) =>
          (!url.searchParams.get("level") ||
            record.level === url.searchParams.get("level")) &&
          (!url.searchParams.get("module") ||
            record.module === url.searchParams.get("module")) &&
          (!url.searchParams.get("q") ||
            record.message
              .toLowerCase()
              .includes(url.searchParams.get("q")!.toLowerCase())),
      );
      await state.logsGate;
      return route.fulfill({ json: { records }, headers });
    }
    const isAdmin = state.loggedIn && url.searchParams.get("view") !== "public";
    if (path.endsWith("/count"))
      return route.fulfill({
        json: state.multiPage ? (isAdmin ? 45 : 25) : isAdmin ? 2 : 1,
        headers,
      });
    const timestamp = new Date().toISOString();
    const item = (id: string, secret: boolean) => ({
      id,
      content_id: id,
      sync_service_id: "feed",
      sync_service_type: SyncServiceType.FEED,
      title: id,
      content: `<p>${id} body</p>`,
      is_secret: secret,
      url: "https://example.com/item",
      created_at: timestamp,
      updated_at: timestamp,
    });
    const publicItems = state.multiPage
      ? Array.from({ length: 25 }, (_, index) =>
          item(index ? `PUBLIC-${index}` : "PUBLIC", false),
        )
      : [item("PUBLIC", false)];
    const privateItems = state.multiPage
      ? Array.from({ length: 20 }, (_, index) =>
          item(index ? `PRIVATE-${index}` : "PRIVATE", true),
        )
      : [item("PRIVATE", true)];
    const allItems = isAdmin ? [...privateItems, ...publicItems] : publicItems;
    const pageIndex = Number(url.searchParams.get("page") ?? 0);
    const limit = Number(url.searchParams.get("limit") ?? 20);
    const items = allItems.slice(pageIndex * limit, (pageIndex + 1) * limit);
    if (isAdmin) await state.timelineGate;
    return route.fulfill({ json: items, headers });
  });
  return state;
}

test("primary admin actions stay in view while reading long logs", async ({
  page,
}) => {
  const state = await backend(page);
  state.logCount = 40;
  const mobile = (page.viewportSize()?.width ?? 0) < 640;
  if (mobile) await page.setViewportSize({ width: 375, height: 780 });
  await page.goto("/");
  const entry = page.getByRole("button", { name: "管理面板", exact: true });
  await expect(entry).toHaveCount(1);
  await entry.click();
  const panel = page.getByRole("dialog", { name: "管理面板" });
  await panel.getByRole("tab", { name: "日志" }).click();
  await panel.getByRole("listitem").last().scrollIntoViewIfNeeded();
  for (const name of ["访客预览", "退出登录", "关闭管理面板"]) {
    await expect(panel.getByRole("button", { name })).toBeInViewport();
  }
  await expect(panel.getByRole("tab", { name: "同步" })).toBeInViewport();
  if (mobile) {
    await page.setViewportSize({ width: 780, height: 375 });
    await expect(
      panel.getByRole("button", { name: "退出登录" }),
    ).toBeInViewport();
    await expect(panel.getByRole("listitem").first()).toBeVisible();
  } else {
    const bounds = await panel.boundingBox();
    expect(bounds?.x).toBeGreaterThan(0);
    expect(bounds!.x + bounds!.width).toBe(page.viewportSize()!.width);
  }
  await page.keyboard.press("Escape");
  await expect(entry).toBeFocused();
});

test("visitors can return to the top of a long timeline", async ({ page }) => {
  const state = await backend(page);
  state.loggedIn = false;
  state.multiPage = true;
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByText("PUBLIC", { exact: true })).toBeVisible();
  const backToTop = page.getByRole("button", { name: "回到顶部" });
  await expect(backToTop).toBeHidden();
  await page.evaluate(() => window.scrollTo(0, window.innerHeight + 100));
  await expect(backToTop).toBeInViewport();
  await backToTop.click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect(backToTop).toBeHidden();
});

test("admin panel is keyboard accessible and a completed run refreshes timeline once", async ({
  page,
}) => {
  const state = await backend(page);
  state.history.push({
    id: "historical-run",
    trigger: "scheduled",
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    status: "succeeded",
    services: [],
  });
  const timelineReads = () =>
    state.requests.filter((request) =>
      request.path.startsWith("/timeline-items"),
    ).length;
  await page.goto("/");
  await expect(page.getByText("PRIVATE", { exact: true })).toBeVisible();
  const initialReads = timelineReads();
  const entry = page
    .getByRole("button", { name: "管理面板", exact: true })
    .filter({ visible: true });
  await entry.focus();
  await page.keyboard.press("Enter");
  const panel = page.getByRole("dialog", { name: "管理面板" });
  await expect(panel).toBeVisible();
  await expect(panel.getByText("运行 historical-run")).toBeVisible();
  await panel.getByRole("tab", { name: "同步", exact: true }).focus();
  await page.keyboard.press("End");
  await expect(
    panel.getByRole("tab", { name: "日志", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Home");
  await expect(
    panel.getByRole("tab", { name: "同步", exact: true }),
  ).toBeFocused();
  await panel.getByRole("button", { name: "开始同步" }).click();
  await expect(panel.getByRole("status")).toContainText("正在等待执行结果");
  await expect(panel.getByRole("button", { name: "开始同步" })).toBeDisabled();
  expect(timelineReads()).toBe(initialReads);
  const itemReads = () =>
    state.requests.filter((request) => request.path === "/timeline-items")
      .length;
  const before = itemReads();
  await expect(panel.getByText(/新增或更新/)).toHaveCount(0);
  state.run!.status = "succeeded";
  state.run!.finishedAt = new Date().toISOString();
  state.run!.services = [
    {
      id: "feed",
      type: SyncServiceType.FEED,
      status: "succeeded",
      itemCount: 3,
    },
    {
      id: "empty",
      type: SyncServiceType.FEED,
      status: "succeeded",
      itemCount: 0,
    },
  ];
  state.history.unshift(state.run!);
  state.run = {
    ...state.run!,
    id: "newer-scheduled-run",
    trigger: "scheduled",
    services: [],
  };
  await expect(panel.getByText(/^运行 /)).toHaveText([
    "运行 newer-scheduled-run",
    "运行 test-run",
    "运行 historical-run",
  ]);
  await expect(panel.getByText("新增或更新 3 条")).toBeVisible();
  await expect(panel.getByText("新增或更新 0 条")).toBeVisible();
  await expect(panel.getByRole("status")).toContainText("本轮同步已结束");
  await expect.poll(itemReads).toBe(before + 1);

  const scheduled = state.run!;
  state.run = null;
  state.history = Array.from({ length: 10 }, (_, index) => ({
    ...scheduled,
    id: `scheduled-${index}`,
  }));
  await expect(panel.getByText("运行 scheduled-0")).toBeVisible();
  await expect(panel.getByRole("status")).toHaveText(
    "同步已受理（test-run）。",
  );
  await expect.poll(itemReads).toBe(before + 2);

  await page.keyboard.press("Escape");
  await expect(panel).not.toBeVisible();
  await expect(entry).toBeFocused();
});

test("logs are text, can be filtered and paused, and stop polling when closed or hidden", async ({
  page,
}, testInfo) => {
  const state = await backend(page);
  await page.clock.install();
  await page.goto("/");
  await page
    .getByRole("button", { name: "管理面板", exact: true })
    .filter({ visible: true })
    .click();
  await page.getByRole("tab", { name: "日志", exact: true }).click();
  const panel = page.getByRole("dialog");
  await expect(panel.getByText(/LOG-MARKER/)).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("admin-logs.png") });
  expect(await page.evaluate(() => "logInjected" in window)).toBe(false);
  const requests = () =>
    state.requests.filter((request) => request.path === "/admin/logs").length;
  const initialCount = requests();
  await page.clock.fastForward(5000);
  await expect.poll(requests).toBe(initialCount + 1);
  await panel.getByRole("checkbox", { name: "自动刷新" }).uncheck();
  const pausedCount = requests();
  await page.clock.fastForward(6000);
  expect(requests()).toBe(pausedCount);
  await panel.getByRole("button", { name: "刷新日志" }).click();
  await expect.poll(requests).toBe(pausedCount + 1);
  await panel.getByRole("textbox", { name: "模块" }).fill("m");
  await panel.getByRole("textbox", { name: "模块" }).fill("missing");
  await panel.getByRole("textbox", { name: "关键词" }).fill("LOG-MARKER");
  expect(requests()).toBe(pausedCount + 1);
  await page.clock.fastForward(500);
  await expect(panel.getByText("无匹配日志。", { exact: true })).toBeVisible();
  expect(requests()).toBe(pausedCount + 2);
  await panel.getByRole("textbox", { name: "模块" }).fill("");
  await page.clock.fastForward(500);
  await panel.getByRole("checkbox", { name: "自动刷新" }).check();
  await expect(panel.getByText(/LOG-MARKER/)).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const hiddenCount = requests();
  await page.clock.fastForward(6000);
  expect(requests()).toBe(hiddenCount);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await panel.getByRole("tab", { name: "同步", exact: true }).click();
  const switchedCount = requests();
  await page.clock.fastForward(6000);
  expect(requests()).toBe(switchedCount);
  await panel.getByRole("button", { name: "关闭管理面板" }).click();
  const closedCount = state.requests.filter((request) =>
    request.path.startsWith("/admin/"),
  ).length;
  await page.clock.fastForward(6000);
  expect(
    state.requests.filter((request) => request.path.startsWith("/admin/"))
      .length,
  ).toBe(closedCount);
});

test("logout failure keeps data and allows a successful retry", async ({
  page,
}) => {
  const state = await backend(page);
  await page.goto("/");
  await page
    .getByRole("button", { name: "管理面板", exact: true })
    .filter({ visible: true })
    .click();
  state.failLogout = true;
  await page.getByRole("button", { name: "退出登录", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("alert").filter({ hasText: "退出失败" }),
  ).toBeVisible();
  await expect(page.getByText("PRIVATE", { exact: true })).toBeVisible();
  state.failLogout = false;
  await page.getByRole("button", { name: "重试退出", exact: true }).click();
  await expect(page.getByText("PRIVATE", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "管理面板", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText("PUBLIC", { exact: true })).toBeVisible();
});

test("guest preview preserves login and filters while replacing cached private data", async ({
  page,
}) => {
  const state = await backend(page);
  await page.goto(
    "/?search=fixture&orderBy=updated_at&serviceId=feed&serviceType=Feed",
  );
  await expect(page.getByText("PRIVATE", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "管理面板", exact: true })
    .filter({ visible: true })
    .click();
  await page.getByRole("button", { name: "访客预览", exact: true }).click();
  await expect(page.getByRole("region", { name: "访客预览" })).toBeVisible();
  await expect(page.getByText("PRIVATE", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("textbox").filter({ visible: true })).toHaveValue(
    "fixture",
  );
  expect(state.loggedIn).toBe(true);
  expect(
    state.requests.filter((request) => request.path === "/logout"),
  ).toHaveLength(0);
  await page.locator(".timeline-item [aria-haspopup='menu']").first().click();
  await expect(page.getByRole("link", { name: "打开链接" })).toBeVisible();
  await expect(page.getByRole("button", { name: "设为私密" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "删除", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "返回管理员视角" }).click();
  await expect(page.getByText("PRIVATE", { exact: true })).toBeVisible();
  await expect(page.getByRole("textbox").filter({ visible: true })).toHaveValue(
    "fixture",
  );
  expect(
    state.requests
      .filter((request) => request.path === "/timeline-items")
      .map((request) => request.view),
  ).toContain("public");
  expect(
    state.requests
      .filter((request) => request.path === "/timeline-items")
      .at(-1)?.view,
  ).toBe("admin");
  for (const request of state.requests.filter((request) =>
    request.path.startsWith("/timeline-items"),
  )) {
    expect(request.search).toBe("fixture");
    expect(request.serviceId).toBe("feed");
    expect(request.orderBy).toBe("updated_at");
  }
  await page
    .getByRole("button", { name: "管理面板", exact: true })
    .filter({ visible: true })
    .click();
  await page.getByRole("button", { name: "访客预览", exact: true }).click();
  await page.reload();
  await expect(page.getByText("PRIVATE", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "访客预览" })).toHaveCount(0);
});

for (const transition of ["preview", "logout", "401"] as const) {
  test(`late private pages and logs cannot return after ${transition}`, async ({
    page,
  }) => {
    const state = await backend(page);
    state.multiPage = true;
    await page.goto("/");
    await expect(page.getByText("PRIVATE", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "加载更多", exact: true }).click();
    await expect(page.getByText("PUBLIC", { exact: true })).toBeVisible();
    await page
      .getByRole("button", { name: "管理面板", exact: true })
      .filter({ visible: true })
      .click();
    const panel = page.getByRole("dialog");
    await panel.getByRole("tab", { name: "日志", exact: true }).click();
    await expect(panel.getByText(/LOG-MARKER/)).toBeVisible();
    let releaseLogs = () => {};
    let releaseTimeline = () => {};
    state.logsGate = new Promise<void>((resolve) => {
      releaseLogs = resolve;
    });
    state.timelineGate = new Promise<void>((resolve) => {
      releaseTimeline = resolve;
    });
    const pendingLogs = page.waitForRequest(
      (request) => new URL(request.url()).pathname === "/admin/logs",
    );
    await panel.getByRole("button", { name: "刷新日志" }).click();
    await pendingLogs;
    state.run = {
      id: "completed-run",
      trigger: "scheduled",
      startedAt: new Date().toISOString(),
      finishedAt: null,
      status: "running",
      services: [],
    };
    await panel.getByRole("tab", { name: "同步", exact: true }).click();
    await expect(panel.getByText("运行中", { exact: true })).toBeVisible();
    state.run.status = "succeeded";
    state.run.finishedAt = new Date().toISOString();
    const pendingTimeline = page.waitForRequest(
      (request) =>
        new URL(request.url()).pathname === "/timeline-items" &&
        new URL(request.url()).searchParams.get("view") === "admin",
    );
    await panel.getByRole("button", { name: "刷新状态" }).click();
    await pendingTimeline;
    if (transition === "preview")
      await panel
        .getByRole("button", { name: "访客预览", exact: true })
        .click();
    else if (transition === "logout")
      await panel
        .getByRole("button", { name: "退出登录", exact: true })
        .click();
    else {
      state.expireSync = true;
      await panel.getByRole("button", { name: "刷新状态" }).click();
    }
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText("PRIVATE", { exact: true })).toHaveCount(0);
    await expect(page.getByText(/LOG-MARKER/)).toHaveCount(0);
    const oldResponses = Promise.all([
      page.waitForResponse(
        (response) => new URL(response.url()).pathname === "/admin/logs",
      ),
      page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === "/timeline-items" &&
          new URL(response.url()).searchParams.get("view") === "admin",
      ),
    ]);
    releaseLogs();
    releaseTimeline();
    await oldResponses;
    await expect(page.getByText("PRIVATE", { exact: true })).toHaveCount(0);
    await expect(page.getByText(/LOG-MARKER/)).toHaveCount(0);
    await expect(page.getByText("PUBLIC", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("progressbar", { includeHidden: true }),
    ).toHaveAttribute("aria-valuenow", "4");
    if (transition === "preview") {
      await expect(
        page.getByRole("button", { name: "返回管理员视角" }),
      ).toBeVisible();
      expect(state.loggedIn).toBe(true);
    } else
      await expect(
        page.getByRole("button", { name: "返回管理员视角" }),
      ).toHaveCount(0);
  });
}

test("unknown acceptance is reconciled with GET and closing the panel stops polling without cancelling work", async ({
  page,
}) => {
  const state = await backend(page);
  state.loseAcceptance = true;
  await page.goto("/");
  await page
    .getByRole("button", { name: "管理面板", exact: true })
    .filter({ visible: true })
    .click();
  const panel = page.getByRole("dialog");
  await panel.getByRole("button", { name: "开始同步" }).click();
  await expect(panel.getByRole("status")).toContainText("受理结果未知");
  await expect(panel.getByRole("button", { name: "开始同步" })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(panel).not.toBeVisible();
  const reads = state.requests.filter(
    (request) => request.path === "/admin/sync" && request.method === "GET",
  ).length;
  await page.waitForTimeout(2200);
  expect(
    state.requests.filter(
      (request) => request.path === "/admin/sync" && request.method === "GET",
    ),
  ).toHaveLength(reads);
  expect(
    state.requests.filter(
      (request) => request.path === "/admin/sync" && request.method === "POST",
    ),
  ).toHaveLength(1);
  expect(state.run?.status).toBe("running");
});

test("login confirmation gates admin requests, and the login form still works", async ({
  page,
}) => {
  const state = await backend(page);
  state.loggedIn = false;
  await page.goto("/?login");
  await expect(
    page.getByRole("button", { name: "管理面板", exact: true }),
  ).toHaveCount(0);
  expect(
    state.requests.filter((request) => request.path.startsWith("/admin/")),
  ).toHaveLength(0);
  await page.locator('input[name="username"]').fill("test");
  await page.locator('input[name="password"]').fill("test");
  await page.getByRole("button", { name: /登\s*录/ }).click();
  await expect(
    page
      .getByRole("button", { name: "管理面板", exact: true })
      .filter({ visible: true }),
  ).toBeVisible();
});

test("unconfirmed identity issues no admin reads and log 401 clears existing restricted data", async ({
  page,
}) => {
  const state = await backend(page);
  let releaseLogin = () => {};
  state.loginGate = new Promise<void>((resolve) => {
    releaseLogin = resolve;
  });
  await page.goto("/");
  await expect
    .poll(
      () =>
        state.requests.filter((request) => request.path === "/login").length,
    )
    .toBe(1);
  await expect(page.getByText("正在确认登录状态…")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "管理面板", exact: true }),
  ).toHaveCount(0);
  expect(
    state.requests.filter(
      (request) =>
        request.path.startsWith("/admin/") ||
        request.path.startsWith("/timeline-items"),
    ),
  ).toHaveLength(0);
  releaseLogin();
  await expect(page.getByText("PRIVATE", { exact: true })).toBeVisible();
  expect(
    state.requests
      .filter((request) => request.path.startsWith("/timeline-items"))
      .every((request) => request.view === "admin"),
  ).toBe(true);
  await page
    .getByRole("button", { name: "管理面板", exact: true })
    .filter({ visible: true })
    .click();
  await page.getByRole("tab", { name: "日志", exact: true }).click();
  await expect(page.getByRole("dialog").getByText(/LOG-MARKER/)).toBeVisible();
  state.expireLogs = true;
  await page.getByRole("button", { name: "刷新日志" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText(/LOG-MARKER/)).toHaveCount(0);
  await expect(page.getByText("PRIVATE", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "管理面板", exact: true }),
  ).toHaveCount(0);
});

test("existing private item controls still update the current admin cache", async ({
  page,
}) => {
  const state = await backend(page);
  await page.goto("/");
  const item = page
    .locator(".timeline-item")
    .filter({ has: page.getByText("PRIVATE", { exact: true }) });
  await item.locator("[aria-haspopup='menu']").click();
  page.once("dialog", (dialog) => void dialog.accept());
  await item.getByRole("button", { name: "设为公开", exact: true }).click();
  await expect(item.getByText("私密", { exact: true })).toHaveCount(0);
  await item.locator("[aria-haspopup='menu']").click();
  await expect(
    item.getByRole("button", { name: "设为私密", exact: true }),
  ).toBeVisible();
  expect(
    state.requests.filter((request) => request.method === "PATCH"),
  ).toHaveLength(1);
});
