import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { SyncRunDto, TimelineItemClient } from "@timeline/contracts";
import { SyncServiceType } from "@timeline/contracts";

import { readClientConfig } from "../config.mjs";

const clientConfig = readClientConfig();

test.use({ timezoneId: "UTC" });
const COVER_URL =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='640' height='360'%3E%3Crect width='640' height='360' fill='tomato'/%3E%3C/svg%3E";
const STEAM_COVER_URL =
  "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/400/library_600x900.jpg";

async function backend(page: Page) {
  page.on("pageerror", (error) =>
    console.error(`Browser error: ${error.message}`),
  );
  const state = {
    loggedIn: true,
    failLogout: false,
    failServices: false,
    serviceLabels: ["feed", "github"],
    expireLogs: false,
    expireSync: false,
    loseAcceptance: false,
    failTimelinePage: null as number | null,
    multiPage: false,
    archiveItems: null as TimelineItemClient[] | null,
    logCount: 1,
    loginGate: null as Promise<void> | null,
    servicesGate: null as Promise<void> | null,
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
      serviceLabel: string | null;
      id: string | null;
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
        "/timeline-services",
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
      serviceLabel: url.searchParams.get("serviceLabel"),
      id: url.searchParams.get("id"),
      orderBy: url.searchParams.get("orderBy"),
    });
    const headers = {
      "access-control-allow-origin": "http://127.0.0.1:3100",
      "access-control-allow-credentials": "true",
      "access-control-allow-headers": "content-type",
      "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
      "cache-control": "private, no-store",
    };
    if (request.method() === "OPTIONS")
      return route.fulfill({ status: 204, headers });
    if (path === "/timeline-services") {
      await state.servicesGate;
      return state.failServices
        ? route.fulfill({ status: 503, body: "unavailable", headers })
        : route.fulfill({
            json: [
              ...new Set([
                ...state.serviceLabels,
                ...(state.archiveItems ?? [])
                  .filter(
                    (item) =>
                      (state.loggedIn &&
                        url.searchParams.get("view") !== "public") ||
                      !item.is_secret,
                  )
                  .map((item) => item.label || item.sync_service_id),
              ]),
            ],
            headers,
          });
    }
    if (
      ["PATCH", "DELETE"].includes(request.method()) &&
      path.startsWith("/timeline-items/")
    )
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
      const serviceId = url.searchParams.get("serviceId");
      const current = state.run?.status === "running" ? state.run : null;
      const history = [
        ...(state.run?.finishedAt ? [state.run] : []),
        ...state.history,
      ];
      const filterRun = (run: SyncRunDto) => {
        if (!serviceId) return [run];
        const result = run.services.find(({ id }) => id === serviceId);
        return result
          ? [{ ...run, status: result.status, services: [result] }]
          : [];
      };
      return route.fulfill({
        json: {
          available: !current,
          reason: current ? "busy" : null,
          serviceId,
          services: [
            { id: "feed", label: "博客" },
            { id: "empty", label: "博客" },
          ],
          activeRunId: current?.id ?? null,
          completedRunIds: history.map(({ id }) => id),
          current: current ? (filterRun(current)[0] ?? null) : null,
          history: history.flatMap(filterRun),
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
    if (path.endsWith("/count") && !state.archiveItems)
      return route.fulfill({
        json: state.multiPage ? (isAdmin ? 45 : 25) : isAdmin ? 2 : 1,
        headers,
      });
    const item = (id: string, secret: boolean) => ({
      id,
      content_id: id,
      sync_service_id: "feed",
      sync_service_type: SyncServiceType.FEED,
      title: id,
      content: `<p>${id} body</p>`,
      is_secret: secret,
      url: "https://example.com/item",
      created_at: secret ? "2026-11-03T01:00:00Z" : "2026-10-03T01:00:00Z",
      updated_at: secret ? "2026-11-03T01:00:00Z" : "2026-10-03T01:00:00Z",
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
    const allItems = state.archiveItems
      ? state.archiveItems
          .filter(
            (item) =>
              (isAdmin || !item.is_secret) &&
              (!url.searchParams.has("id") ||
                item.id === url.searchParams.get("id")) &&
              (!url.searchParams.has("serviceLabel") ||
                (item.label || item.sync_service_id) ===
                  url.searchParams.get("serviceLabel")) &&
              item.title?.includes(url.searchParams.get("search") ?? ""),
          )
          .sort((a, b) => {
            const field =
              url.searchParams.get("orderBy") === "updated_at"
                ? "updated_at"
                : "created_at";
            return b[field].localeCompare(a[field]);
          })
      : isAdmin
        ? [...privateItems, ...publicItems]
        : publicItems;
    if (path.endsWith("/count"))
      return route.fulfill({ json: allItems.length, headers });
    const pageIndex = Number(url.searchParams.get("page") ?? 0);
    if (pageIndex === state.failTimelinePage)
      return route.fulfill({ status: 500, body: "failed", headers });
    const limit = Number(url.searchParams.get("limit") ?? 20);
    const items = allItems.slice(pageIndex * limit, (pageIndex + 1) * limit);
    if (isAdmin) await state.timelineGate;
    return route.fulfill({ json: items, headers });
  });
  return state;
}

async function recordDialogMotion(page: Page) {
  await page.addInitScript(() => {
    document.addEventListener("transitionrun", (event) => {
      const dialog = event.target;
      if (dialog instanceof HTMLDialogElement) {
        const property = `${event.propertyName}${event.pseudoElement}`;
        dialog.dataset.motion = `${dialog.dataset.motion ?? ""} ${property}`;
      }
    });
  });
}

async function showToolbarControls(page: Page) {
  const theme = page.getByRole("button", {
    name: "纸张浅色主题",
    includeHidden: true,
  });
  await expect(theme).toBeAttached();
  const trigger = page.getByRole("button", { name: "时间线菜单" });
  if (
    page.viewportSize()!.width < 640 &&
    (await trigger.getAttribute("aria-expanded")) === "false"
  )
    await trigger.click();
  await expect(theme).toBeVisible();
}

test("achievement cards and Steam portrait covers fit both themes and viewports", async ({
  page,
}, testInfo) => {
  if (testInfo.project.name === "mobile")
    await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const state = await backend(page);
  const longTitle =
    "同名游戏与很长的追加内容标题 Long Game Achievement Title ".repeat(3);
  const definitions = [
    {
      platform: "psn",
      type: SyncServiceType.PSN_GAME_ACHIEVEMENT,
      kind: "platinum",
      label: "PSN",
      title: longTitle,
    },
    {
      platform: "psn",
      type: SyncServiceType.PSN_GAME_ACHIEVEMENT,
      kind: "all_achievements",
      label: "PSN",
      title: longTitle,
    },
    {
      platform: "xbox",
      type: SyncServiceType.XBOX_GAME_ACHIEVEMENT,
      kind: "mythic",
      label: "Xbox",
      title: "Xbox game",
    },
    {
      platform: "steam",
      type: SyncServiceType.STEAM_GAME_ACHIEVEMENT,
      kind: "all_achievements",
      label: "Steam",
      title: "Steam game",
    },
  ] as const;
  state.archiveItems = definitions.map((d, index) => ({
    id: `10000000-0000-4000-8000-00000000000${index}`,
    content_id: `${d.platform}:${d.kind}`,
    sync_service_id: d.label,
    sync_service_type: d.type,
    title: d.title,
    label: d.label,
    content: d.kind,
    url:
      d.platform === "steam"
        ? "https://steamcommunity.com/stats/400/achievements/"
        : undefined,
    attachments: [
      {
        filename: "cover",
        url:
          d.platform === "steam"
            ? STEAM_COVER_URL
            : index === 0
              ? "https://example.com/missing-achievement-cover.jpg"
              : COVER_URL,
      },
    ],
    achievement: {
      platform: d.platform,
      gameId: "game",
      kind: d.kind,
      earnedCount: 54,
      totalCount: 54,
    },
    created_at: `2021-01-0${index + 1}T00:00:00Z`,
    updated_at:
      d.platform === "steam"
        ? "2021-02-01T00:00:00Z"
        : `2021-01-0${index + 1}T00:00:00Z`,
    is_secret: false,
  }));
  state.archiveItems.push({
    id: "10000000-0000-4000-8000-000000000004",
    content_id: "400",
    sync_service_id: "Steam reviews",
    sync_service_type: SyncServiceType.STEAM_GAME_REVIEW,
    title: "推荐",
    content: "<p>Steam 评测正文</p>",
    attachments: [{ filename: "cover.jpg", url: STEAM_COVER_URL }],
    url: "https://steamcommunity.com/id/fixture/recommended/400/",
    created_at: "2021-01-05T00:00:00Z",
    updated_at: "2021-01-05T00:00:00Z",
  });
  await page.route(STEAM_COVER_URL, (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><rect width="600" height="900" fill="steelblue"/></svg>',
    }),
  );
  await page.route("**/missing-achievement-cover.jpg", (route) =>
    route.fulfill({ status: 404 }),
  );
  await page.goto("/");
  await expect(page.getByRole("article")).toHaveCount(5);
  await expect(page.getByText("白金奖杯", { exact: true })).toBeVisible();
  await expect(page.getByText("Mythic", { exact: true })).toBeVisible();
  await expect(page.getByText("全成就", { exact: true })).toHaveCount(2);
  await expect(page.getByText(/达成时 54\/54/)).toHaveCount(4);
  await expect(page.getByRole("img", { name: "暂无游戏封面" })).toBeVisible();
  const link = page.getByRole("link", { name: "Steam game · Steam 成就页面" });
  const steamCard = page.getByRole("article").filter({ has: link });
  const reviewCover = page.locator(
    'a[href="https://steamcommunity.com/app/400"] img',
  );
  for (const cover of [steamCard.locator("img"), reviewCover]) {
    await expect(cover).toHaveAttribute("src", STEAM_COVER_URL);
    await expect(cover).toHaveCSS("object-fit", "contain");
    await expect
      .poll(() => cover.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBe(600);
    const box = await cover.boundingBox();
    expect(box && box.height / box.width).toBeCloseTo(1.5);
  }
  const reviewText = page.getByText("Steam 评测正文");
  const textBox = await reviewText.boundingBox();
  const coverBox = await reviewCover.boundingBox();
  if (!textBox || !coverBox) throw new Error("Steam review is missing content");
  if (testInfo.project.name === "mobile")
    expect(textBox.y).toBeGreaterThanOrEqual(coverBox.y + coverBox.height);
  else expect(textBox.x).toBeGreaterThanOrEqual(coverBox.x + coverBox.width);
  if (testInfo.project.name === "desktop") {
    await test.step("achievement animation finishes through pointer exit and re-entry", async () => {
      await page.emulateMedia({ reducedMotion: "no-preference" });
      const shine = steamCard.locator("span.-translate-x-full");
      await steamCard.hover();
      const playback = await shine.evaluateHandle((element) => {
        const [animation] = element.getAnimations();
        if (!animation) throw new Error("Hover did not start the animation");
        // Slow playback so the pointer moves cannot race the end of the animation.
        animation.updatePlaybackRate(0.1);
        return animation;
      });

      await page.mouse.move(0, 0);
      expect(await playback.evaluate((animation) => animation.playState)).toBe(
        "running",
      );
      await steamCard.hover();
      expect(
        await shine.evaluate(
          (element, animation) => element.getAnimations()[0] === animation,
          playback,
        ),
      ).toBe(true);

      await page.mouse.move(0, 0);
      await playback.evaluate(async (animation) => {
        animation.updatePlaybackRate(1);
        await animation.finished;
      });
      await steamCard.hover();
      expect(
        await shine.evaluate(
          (element) => element.getAnimations()[0]?.playState,
        ),
      ).toBe("running");
      await page.mouse.move(0, 0);
      await page.emulateMedia({ reducedMotion: "reduce" });
    });
  }
  await link.focus();
  await expect(link).toBeFocused();
  expect(
    await link.evaluate((node) => getComputedStyle(node).outlineStyle),
  ).not.toBe("none");
  for (const theme of ["dark", "paper"]) {
    await showToolbarControls(page);
    if ((await page.locator("html").getAttribute("data-theme")) !== theme)
      await page.getByRole("button", { name: "纸张浅色主题" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    const menu = page.getByRole("button", { name: "时间线菜单" });
    if (
      (await menu.isVisible()) &&
      (await menu.getAttribute("aria-expanded")) === "true"
    )
      await menu.click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`achievements-${theme}.png`),
      fullPage: true,
    });
  }
  await page.goto("/?orderBy=updated_at");
  await expect(steamCard.locator("time")).toHaveAttribute(
    "datetime",
    "2021-01-04T00:00:00Z",
  );
  await page.goto("/?search=" + encodeURIComponent("同名游戏 type:PSN"));
  await expect(page.getByRole("article")).toHaveCount(2);
  state.archiveItems[0]!.is_secret = true;
  state.loggedIn = false;
  await page.goto(
    "/?search=" + encodeURIComponent("id:" + state.archiveItems[0]!.id),
  );
  await expect
    .poll(() =>
      state.requests.some(
        (r) =>
          r.path === "/timeline-items" && r.id === state.archiveItems![0]!.id,
      ),
    )
    .toBe(true);
  await expect(page.getByRole("article")).toHaveCount(0);
  await expect(
    page.getByText("没有找到相关内容", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: longTitle })).toHaveCount(0);
});

const searchFixture = (): TimelineItemClient[] => [
  {
    id: "6f1e6c1a-6a1f-4b0e-8f3f-2a1e3f6c9d10",
    content_id: "travel",
    sync_service_id: "feed",
    sync_service_type: SyncServiceType.FEED,
    title: "旅行文章",
    content: "<p>旅行内容</p>",
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2026-11-01T00:00:00Z",
    is_secret: false,
  },
  {
    id: "6f1e6c1a-6a1f-4b0e-8f3f-2a1e3f6c9d11",
    content_id: "reading",
    sync_service_id: "github",
    sync_service_type: SyncServiceType.FEED,
    title: "读书评论",
    created_at: "2026-02-01T00:00:00Z",
    updated_at: "2025-12-01T00:00:00Z",
    is_secret: false,
  },
  {
    id: "6f1e6c1a-6a1f-4b0e-8f3f-2a1e3f6c9d12",
    content_id: "secret",
    sync_service_id: "feed",
    sync_service_type: SyncServiceType.FEED,
    title: "私密旅行",
    created_at: "2024-03-01T00:00:00Z",
    updated_at: "2025-04-01T00:00:00Z",
    is_secret: true,
  },
];

test("search offers a unique label and shows entries from all its sources", async ({
  page,
}) => {
  const state = await backend(page);
  state.loggedIn = false;
  const fixtures = searchFixture();
  state.archiveItems = [
    ...["psn", "xbox", "steam"].map((id, index) => ({
      ...fixtures[index],
      sync_service_id: id,
      label: "成就奖杯",
      title: ["旅行成就", "Xbox 成就", "Steam 成就"][index],
      is_secret: false,
    })),
    {
      ...fixtures[0],
      id: "6f1e6c1a-6a1f-4b0e-8f3f-2a1e3f6c9d13",
      title: "普通文章",
    },
  ];
  await page.goto("/?search=旅行");
  const input = page.getByRole("textbox", { name: "搜索时间线" });
  await expect(input).toHaveValue("旅行");
  await input.click();
  const choice = page
    .getByRole("list", { name: "按类型筛选" })
    .getByRole("button", { name: "成就奖杯", exact: true });
  await expect(choice).toHaveCount(1);
  await choice.click();
  await expect(input).toHaveValue("");
  await expect(
    page.getByRole("button", { name: "移除 类型: 成就奖杯" }),
  ).toBeVisible();
  await expect(choice).toHaveCount(0);
  for (const title of ["旅行成就", "Xbox 成就", "Steam 成就"]) {
    await expect(page.getByText(title, { exact: true })).toBeVisible();
  }
  await expect(page.getByText("普通文章", { exact: true })).toHaveCount(0);
  expect(new URL(page.url()).searchParams.get("search")).toBe("type:成就奖杯");
});

test("the reading month stays visible until search results arrive", async ({
  page,
}) => {
  const state = await backend(page);
  state.archiveItems = searchFixture();
  await page.goto("/");
  const month = page
    .getByRole("group", { name: "当前阅读年月" })
    .locator("time");
  await expect(month).toHaveAttribute("datetime", "2026-02");
  let release = () => {};
  state.timelineGate = new Promise<void>((resolve) => {
    release = resolve;
  });

  const input = page.getByRole("textbox", { name: "搜索时间线" });
  try {
    await input.fill("旅行文章");
    await input.press("Enter");
    await expect(page.getByText("读书评论", { exact: true })).toHaveCount(0);
    await expect(month).toHaveAttribute("datetime", "2026-02");
  } finally {
    release();
    state.timelineGate = null;
  }

  await expect(month).toHaveAttribute("datetime", "2025-01");
  await input.fill("找不到的内容");
  await input.press("Enter");
  await expect(
    page.getByText("没有找到相关内容", { exact: true }),
  ).toBeVisible();
  await expect(month).toHaveCount(0);
});

test("structured timeline filters restore URL history and cancel pending keywords", async ({
  page,
}) => {
  const state = await backend(page);
  state.archiveItems = searchFixture();
  state.loggedIn = false;
  await page.goto("/?search=旅行%20type:feed&orderBy=updated_at&ignored=yes");
  const input = page.getByRole("textbox", { name: "搜索时间线" });
  await expect(input).toHaveValue("旅行");
  await expect(
    page.getByRole("button", { name: "移除 类型: feed", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("旅行文章", { exact: true })).toBeVisible();
  await expect(page.getByText("读书评论", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "2026", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(input).toHaveValue("旅行");
  await expect(page.getByText("旅行文章", { exact: true })).toBeVisible();
  await page.evaluate(() =>
    window.history.pushState(null, "", "/?search=读书&orderBy=created_at"),
  );
  await expect(input).toHaveValue("读书");
  await expect(page.getByText("读书评论", { exact: true })).toBeVisible();
  await input.fill("尚未提交");
  await page.goBack();
  await expect(input).toHaveValue("旅行");
  await page.waitForTimeout(650);
  expect(new URL(page.url()).searchParams.get("search")).toBe("旅行 type:feed");
  await page.goForward();
  await expect(input).toHaveValue("读书");
  await expect(page.getByText("读书评论", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "搜索排序" }).click();
  await page.getByRole("button", { name: "按更新时间排序" }).click();
  await expect(page).toHaveURL(/orderBy=updated_at/);
  await expect(
    page.getByRole("heading", { name: "2025", exact: true }),
  ).toBeVisible();
});

test("structured conditions are removable, exclusive, and invalid syntax stays searchable", async ({
  page,
}) => {
  const state = await backend(page);
  state.archiveItems = searchFixture();
  state.loggedIn = false;
  await page.goto("/");
  const input = page.getByRole("textbox", { name: "搜索时间线" });
  const id = state.archiveItems[0].id;
  await input.evaluate((element, text) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData("text/plain", text);
    element.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData,
      }),
    );
  }, `id:${id}`);
  await expect(
    page.getByRole("button", { name: `移除 id:${id}`, exact: true }),
  ).toBeVisible();
  await expect(input).toHaveValue("");
  await expect(page.getByText("旅行文章", { exact: true })).toBeVisible();
  await expect(page.getByText("读书评论", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("group", { name: "当前阅读年月" })).toContainText(
    "2025 年 01 月",
  );
  await page.screenshot({
    path: test.info().outputPath("timeline-search-id.png"),
  });
  await input.fill("读书 type:github");
  await input.press("Enter");
  await expect(
    page.getByRole("button", { name: `移除 id:${id}`, exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "移除 类型: github", exact: true }),
  ).toBeVisible();
  await expect(input).toHaveValue("读书");
  await expect(page.getByText("读书评论", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "移除 类型: github", exact: true })
    .click();
  await expect(page).toHaveURL(/search=%E8%AF%BB%E4%B9%A6$/);
  const historyLength = await page.evaluate(() => window.history.length);
  await input.fill("id:hello type:unknown");
  await expect
    .poll(
      () =>
        state.requests.filter((r) => r.path === "/timeline-items").at(-1)
          ?.search,
    )
    .toBe("id:hello type:unknown");
  expect(
    state.requests.filter((r) => r.path === "/timeline-items").at(-1)?.id,
  ).toBeNull();
  expect(
    state.requests.filter((r) => r.path === "/timeline-items").at(-1)
      ?.serviceLabel,
  ).toBeNull();
  expect(await page.evaluate(() => window.history.length)).toBe(historyLength);
  await expect(input).toHaveValue("id:hello type:unknown");
  await expect(
    page.getByRole("status").filter({ hasText: "没有找到相关内容" }),
  ).toBeVisible();
  await input.fill(`id:${id}`);
  await input.press("Enter");
  await page
    .getByRole("button", { name: `移除 id:${id}`, exact: true })
    .click();
  await expect(input).toHaveValue("");
  await expect(page.getByText("读书评论", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    page.viewportSize()!.width,
  );
});

test("source menus share single items and filter types without changing state on clipboard failure", async ({
  page,
}) => {
  const state = await backend(page);
  state.archiveItems = searchFixture();
  state.loggedIn = false;
  let copied = "";
  await page.exposeFunction("captureTimelineLink", (value: string) => {
    copied = value;
  });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: (value: string) =>
          Reflect.get(window, "captureTimelineLink")(value),
      },
    });
  });
  await page.goto("/");
  const id = state.archiveItems[0].id;
  await page
    .locator(`[id="${id}"]`)
    .getByRole("button", { name: "feed", exact: true })
    .click();
  await page.getByRole("button", { name: "只看当前类型", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "移除 类型: feed", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("读书评论", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "feed", exact: true }).click();
  const beforeCopy = page.url();
  await page.getByRole("button", { name: "复制分享链接", exact: true }).click();
  await expect.poll(() => copied).not.toBe("");
  await expect(page.getByText("分享链接已复制", { exact: true })).toBeVisible();
  await page.waitForTimeout(650);
  expect(new URL(copied).searchParams.get("search")).toBe(`id:${id}`);
  await expect(page).toHaveURL(beforeCopy);
  await expect(
    page.getByRole("button", { name: "移除 类型: feed", exact: true }),
  ).toBeVisible();
  await page.goto(copied);
  await expect(page.getByText("旅行文章", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: `移除 id:${id}`, exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: `移除 id:${id}`, exact: true })
    .click();
  await expect(page.getByText("读书评论", { exact: true })).toBeVisible();
  const before = page.url();
  await page.evaluate(() =>
    Object.defineProperty(navigator.clipboard, "writeText", {
      value: async () => {
        throw new Error("denied");
      },
    }),
  );
  await page
    .locator(`[id="${id}"]`)
    .getByRole("button", { name: "feed", exact: true })
    .click();
  await page.getByRole("button", { name: "复制分享链接", exact: true }).click();
  await expect(
    page.getByText("复制失败，请检查剪贴板权限后重试", { exact: true }),
  ).toBeVisible();
  expect(page.url()).toBe(before);
  await expect(page.getByText("旅行文章", { exact: true })).toBeVisible();
  await expect(page.getByText("读书评论", { exact: true })).toBeVisible();
});

test("source labels with spaces and apostrophes restore and filter every matching item", async ({
  page,
}) => {
  const state = await backend(page);
  state.loggedIn = false;
  const source = "Lolipop's Thoughts";
  state.serviceLabels.push("Lolipop's", source);
  state.archiveItems = searchFixture().map((item, index) => ({
    ...item,
    sync_service_id: index < 2 ? source : "other",
    is_secret: false,
    title: index < 2 ? item.title : "其它来源",
  }));
  await page.goto("/?search=type%3ALolipop%27s+Thoughts");
  const tag = page.getByRole("button", {
    name: `移除 类型: ${source}`,
    exact: true,
  });
  await expect(tag).toBeVisible();
  await expect(page.getByRole("textbox", { name: "搜索时间线" })).toHaveValue(
    "",
  );
  await expect(page.getByText("旅行文章", { exact: true })).toBeVisible();
  await expect(page.getByText("读书评论", { exact: true })).toBeVisible();
  await expect(page.getByText("其它来源", { exact: true })).toHaveCount(0);
  expect(
    state.requests
      .filter((request) => request.path === "/timeline-items")
      .at(-1)?.serviceLabel,
  ).toBe(source);
  expect(
    state.requests
      .filter((request) => request.path === "/timeline-items")
      .at(-1)?.search,
  ).toBeNull();
  await tag.click();
  await expect(page.getByText("其它来源", { exact: true })).toBeVisible();
  const input = page.getByRole("textbox", { name: "搜索时间线" });
  await input.pressSequentially(`type:${source}`);
  await input.press("Enter");
  await expect(tag).toBeVisible();
  await expect(page.getByText("读书评论", { exact: true })).toBeVisible();
  await tag.click();
  await expect(page.getByText("其它来源", { exact: true })).toBeVisible();
  await page
    .locator(`[id="${state.archiveItems[0].id}"]`)
    .getByRole("button", { name: source, exact: true })
    .click();
  await page.getByRole("button", { name: "只看当前类型", exact: true }).click();
  await expect(tag).toBeVisible();
  await expect(page.getByText("旅行文章", { exact: true })).toBeVisible();
  await expect(page.getByText("读书评论", { exact: true })).toBeVisible();
  await expect(page.getByText("其它来源", { exact: true })).toHaveCount(0);
  expect(new URL(page.url()).searchParams.get("search")).toBe(`type:${source}`);
  await page.reload();
  await expect(tag).toBeVisible();
  await expect(page.getByText("读书评论", { exact: true })).toBeVisible();
});

test("source menu puts link opening before sharing and type filtering", async ({
  page,
}) => {
  const state = await backend(page);
  state.loggedIn = false;
  await page.goto("/");
  const source = page.getByRole("button", { name: "feed", exact: true });
  await source.click();
  await expect(source.locator("..").locator("ul > li")).toHaveText([
    "打开链接",
    "复制分享链接",
    "只看当前类型",
  ]);
});

test("the archive frame persists through all three initial loading stages", async ({
  page,
}) => {
  const state = await backend(page);
  const login = Promise.withResolvers<void>();
  const services = Promise.withResolvers<void>();
  const entries = Promise.withResolvers<void>();
  state.loginGate = login.promise;
  state.servicesGate = services.promise;
  state.timelineGate = entries.promise;

  await page.goto("/");
  const toolbar = page.getByRole("complementary", { name: "时间线工具" });
  const archive = page.locator("[data-timeline-archive]");
  const status = archive.getByRole("status");
  const frame = () =>
    archive.evaluate((element) => {
      const { x, y, width } = element.getBoundingClientRect();
      return { x, y, width };
    });

  await expect(toolbar).toBeVisible();
  await expect(archive).toHaveCSS("border-left-width", "1px");
  await expect(status).toHaveText("正在确认登录状态…");
  await expect(archive.locator("[aria-hidden=true]")).toBeVisible();
  const initialFrame = await frame();

  login.resolve();
  await expect(status).toHaveText("正在加载筛选来源");
  expect(await frame()).toEqual(initialFrame);
  services.resolve();
  await expect(status).toHaveText("正在加载时间线");
  expect(await frame()).toEqual(initialFrame);
  entries.resolve();
  await expect(archive.getByText("PRIVATE", { exact: true })).toBeVisible();
  expect(await frame()).toEqual(initialFrame);
});

test("service catalog failure gates structured requests and can be retried", async ({
  page,
}) => {
  const state = await backend(page);
  state.archiveItems = searchFixture();
  state.loggedIn = false;
  state.failServices = true;
  await page.goto("/?search=type:feed");
  await expect(
    page.locator("[data-timeline-archive]").getByRole("alert"),
  ).toHaveText("筛选来源加载失败");
  expect(
    state.requests.filter((request) => request.path === "/timeline-items"),
  ).toHaveLength(0);
  state.failServices = false;
  await page.getByRole("button", { name: "重试加载", exact: true }).click();
  await expect(page.getByText("旅行文章", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "移除 类型: feed", exact: true }),
  ).toBeVisible();
  expect(
    state.requests
      .filter((request) => request.path === "/timeline-items")
      .at(-1)?.serviceLabel,
  ).toBe("feed");
});

test("private ID links stay empty for visitors and preview, and restore for administrators", async ({
  page,
}) => {
  const state = await backend(page);
  state.archiveItems = searchFixture();
  state.loggedIn = false;
  const id = state.archiveItems[2].id;
  await page.goto(`/?search=id:${id}`);
  await expect(
    page.getByRole("status").filter({ hasText: "没有找到相关内容" }),
  ).toBeVisible();
  state.loggedIn = true;
  await page.reload();
  await expect(page.getByText("私密旅行", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "feed", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "复制分享链接", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await showToolbarControls(page);
  const preview = page.getByRole("button", {
    name: /^(访客预览|管理员模式)$/,
    includeHidden: true,
  });
  await preview.click();
  await expect(page.getByText("私密旅行", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("status").filter({ hasText: "没有找到相关内容" }),
  ).toBeVisible();
  await showToolbarControls(page);
  await preview.click();
  await expect(page.getByText("私密旅行", { exact: true })).toBeVisible();
  await page.goto("/?search=id:00000000-0000-4000-8000-000000000000");
  await expect(
    page.getByRole("status").filter({ hasText: "没有找到相关内容" }),
  ).toBeVisible();
});

test("typed conditions preserve service prefixes and unknown suffixes until confirmation", async ({
  page,
}) => {
  const state = await backend(page);
  state.loggedIn = false;
  state.serviceLabels.push("feedExtra");
  state.archiveItems = searchFixture();
  state.archiveItems[1].sync_service_id = "feedExtra";
  await page.goto("/");
  const input = page.getByRole("textbox", { name: "搜索时间线" });
  await input.pressSequentially("type:feedExtra", { delay: 25 });
  await input.press("Enter");
  await expect(
    page.getByRole("button", { name: "移除 类型: feedExtra", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("读书评论", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "移除 类型: feedExtra", exact: true })
    .click();
  await expect(page).toHaveURL("/");
  await expect(
    page.getByRole("button", { name: "移除 类型: feedExtra", exact: true }),
  ).toHaveCount(0);
  await input.pressSequentially("type:feedUnknown", { delay: 25 });
  await input.press("Enter");
  await expect
    .poll(
      () =>
        state.requests.filter((r) => r.path === "/timeline-items").at(-1)
          ?.search,
    )
    .toBe("type:feedUnknown");
  expect(
    state.requests.filter((r) => r.path === "/timeline-items").at(-1)
      ?.serviceLabel,
  ).toBeNull();
  await expect(input).toHaveValue("type:feedUnknown");
});

test("keyword spaces survive the debounced URL update", async ({ page }) => {
  const state = await backend(page);
  state.loggedIn = false;
  await page.goto("/");
  const input = page.getByRole("textbox", { name: "搜索时间线" });
  await input.pressSequentially("hello ");
  await page.waitForTimeout(700);
  await expect(input).toHaveValue("hello ");
  await input.pressSequentially("world");
  await input.press("Enter");
  await expect(input).toHaveValue("hello world");
  await expect(page).toHaveURL(/search=hello\+world$/);
});

test("source filtering includes the keyword draft before its debounce expires", async ({
  page,
}) => {
  const state = await backend(page);
  state.loggedIn = false;
  state.archiveItems = searchFixture()
    .slice(0, 2)
    .map((item, index) => ({
      ...item,
      sync_service_id: "feed",
      title: index ? "new" : "old",
    }));
  await page.goto("/?search=old");
  await expect(page.getByText("old", { exact: true })).toBeVisible();
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  const input = page.getByRole("textbox", { name: "搜索时间线" });
  await input.fill("new");
  await page.getByRole("button", { name: "feed", exact: true }).click();
  await page.getByRole("button", { name: "只看当前类型", exact: true }).click();
  await page.clock.fastForward(700);
  await page.clock.resume();
  await expect(input).toHaveValue("new");
  await expect(page.getByText("new", { exact: true })).toBeVisible();
  expect(new URL(page.url()).searchParams.get("search")).toBe("new type:feed");
});

test("late clipboard completion cannot cancel a newer URL's keyword submission", async ({
  page,
}) => {
  const state = await backend(page);
  state.loggedIn = false;
  state.archiveItems = searchFixture().map((item, index) => ({
    ...item,
    is_secret: false,
    title: ["old", "new", "later"][index],
  }));
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: () =>
          new Promise<void>((resolve) =>
            Reflect.set(window, "finishTimelineCopy", resolve),
          ),
      },
    }),
  );
  await page.goto("/?search=old");
  await page.getByRole("button", { name: "feed", exact: true }).click();
  await page.getByRole("button", { name: "复制分享链接", exact: true }).click();
  await page.evaluate(() => window.history.pushState(null, "", "/?search=new"));
  const input = page.getByRole("textbox", { name: "搜索时间线" });
  await expect(input).toHaveValue("new");
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await input.fill("later");
  await page.evaluate(() => Reflect.get(window, "finishTimelineCopy")());
  await page.clock.fastForward(700);
  await page.clock.resume();
  await expect
    .poll(
      () =>
        state.requests.filter((r) => r.path === "/timeline-items").at(-1)
          ?.search,
    )
    .toBe("later");
  await expect(page.getByText("later", { exact: true })).toBeVisible();
});

test("IME composition stays in the input until its condition is confirmed", async ({
  page,
}) => {
  const state = await backend(page);
  state.loggedIn = false;
  state.serviceLabels.push("日志");
  state.archiveItems = searchFixture();
  state.archiveItems[0].sync_service_id = "日志";
  await page.goto("/");
  const input = page.getByRole("textbox", { name: "搜索时间线" });
  await expect(page.getByText("旅行文章", { exact: true })).toBeVisible();
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await input.evaluate((element) => {
    element.dispatchEvent(
      new CompositionEvent("compositionstart", { bubbles: true }),
    );
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(element, "type:日志");
    element.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        inputType: "insertCompositionText",
        data: "日志",
        isComposing: true,
      }),
    );
  });
  await page.clock.fastForward(700);
  expect(new URL(page.url()).search).toBe("");
  await expect(input).toHaveValue("type:日志");
  await page.clock.resume();
  await input.evaluate((element) =>
    element.dispatchEvent(
      new CompositionEvent("compositionend", { bubbles: true, data: "日志" }),
    ),
  );
  await input.press("Enter");
  await expect(
    page.getByRole("button", { name: "移除 类型: 日志", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("旅行文章", { exact: true })).toBeVisible();
});

test("stored source links still work after their configuration is removed", async ({
  page,
}) => {
  const state = await backend(page);
  state.loggedIn = false;
  state.archiveItems = searchFixture();
  state.archiveItems[0].sync_service_id = "retired-feed";
  await page.goto("/?search=type:retired-feed");
  await expect(page.getByText("旅行文章", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "移除 类型: retired-feed", exact: true }),
  ).toBeVisible();
  expect(
    state.requests.filter((r) => r.path === "/timeline-items").at(-1)
      ?.serviceLabel,
  ).toBe("retired-feed");
});

test("the archive date and site links fit the responsive toolbar", async ({
  page,
}) => {
  const state = await backend(page);
  state.loggedIn = false;
  await page.goto("/");
  const toolbar = page.getByRole("complementary", { name: "时间线工具" });
  await expect(
    toolbar.getByRole("button", { name: /^(访客预览|管理员模式)$/ }),
  ).toHaveCount(0);
  const reading = toolbar.getByRole("group", { name: "当前阅读年月" });
  await expect(reading.getByText("貳〇貳陸", { exact: true })).toBeVisible();
  await expect(reading.getByText("金秋十月", { exact: true })).toBeVisible();

  const configuredLinks = [
    { name: "个人主页", href: clientConfig.homepage },
    { name: "GitHub", href: clientConfig.github },
    {
      name: "电子邮件",
      href: clientConfig.email ? `mailto:${clientConfig.email}` : undefined,
    },
  ].flatMap(({ name, href }) => (href ? [{ name, href }] : []));
  const trigger = toolbar.getByRole("button", { name: "时间线菜单" });
  const search = toolbar.getByRole("textbox", { name: "搜索时间线" });
  const searchWidth = () =>
    search.evaluate((el) => el.getBoundingClientRect().width);
  const { width, height } = page.viewportSize()!;
  if (width >= 1024) {
    await expect(trigger).toBeHidden();
    for (const { name } of configuredLinks) {
      const link = toolbar.getByRole("link", { name, exact: true });
      await expect(link).toBeInViewport();
      expect(
        await link.evaluate((el) => el.getBoundingClientRect().top),
      ).toBeGreaterThan(height - 100);
    }
  }

  await page.setViewportSize({ width: 320, height });
  const narrowWidth = await searchWidth();
  expect(narrowWidth).toBeGreaterThan(96);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    320,
  );
  await expect(trigger).toBeVisible();
  await trigger.press("Enter");
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  for (const { name, href } of configuredLinks) {
    const link = toolbar.getByRole("link", { name, exact: true });
    await expect(link).toBeInViewport();
    await expect(link).toHaveAttribute("href", href);
  }
  await page.keyboard.press("Tab");
  await expect(
    toolbar.getByRole("button", { name: "纸张浅色主题" }),
  ).toBeFocused();
  if (configuredLinks.length) {
    await page.keyboard.press("Tab");
    await expect(
      toolbar.getByRole("link", { name: configuredLinks[0].name, exact: true }),
    ).toBeFocused();
  }
  await page.keyboard.press("Escape");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(trigger).toBeFocused();
  await page.setViewportSize({ width: 390, height });
  expect(await searchWidth()).toBeGreaterThan(narrowWidth);
});

test("archive joins pages within a month and follows the sorted reading position", async ({
  page,
}) => {
  const state = await backend(page);
  state.loggedIn = false;
  const item = (title: string, created_at: string): TimelineItemClient => ({
    id: title,
    content_id: title,
    sync_service_id: "feed",
    sync_service_type: SyncServiceType.FEED,
    title,
    content:
      '[链接](https://example.com)\n\n> 引用\n\n<pre><code><span class="pl-c">代码</span></code></pre>',
    created_at,
    updated_at: created_at,
  });
  const latest = {
    ...item("Latest article", "2026-02-10T12:30:00Z"),
    url: "https://example.com/technical-blog",
  };
  const coverName = "【Cover story】";
  state.archiveItems = [
    {
      ...latest,
      content: `${latest.content}\n\n<img src="${COVER_URL}" alt="归档图片">\n\n${"长文段落。\n\n".repeat(30)}`,
    },
    {
      ...item(coverName, "2025-12-27T11:45:00Z"),
      sync_service_id: "video",
      sync_service_type: SyncServiceType.BILIBILI_WORK,
      url: "https://example.com/cover",
      attachments: [
        {
          filename: "cover.svg",
          url: COVER_URL,
        },
      ],
      content: "封面简介",
    },
    {
      ...item("Short comment", "2025-12-26T11:45:00Z"),
      sync_service_id: "github",
      sync_service_type: SyncServiceType.GITHUB_ISSUE_COMMENT,
      content: "Short comment body",
    },
    ...Array.from({ length: 21 }, (_, index) => ({
      ...item(
        `Archive ${index}`,
        `2025-12-${String(25 - index).padStart(2, "0")}T11:45:00Z`,
      ),
      ...(index === 20 && { updated_at: "2026-03-14T09:15:00Z" }),
    })),
    {
      ...item("Final short comment", "2025-11-28T11:45:00Z"),
      sync_service_type: SyncServiceType.GITHUB_ISSUE_COMMENT,
      content: "Final short comment body",
    },
  ];
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
  await page.goto("/");
  const year = (name: string) =>
    page.getByRole("heading", { name, exact: true });
  const reading = page.getByRole("group", { name: "当前阅读年月" });
  await expect(year("2026")).toBeVisible();
  await expect(year("2025")).toBeVisible();
  await expect(reading).toContainText("2026 年 02 月");
  const color = (locator: Locator) =>
    locator.evaluate((element) => getComputedStyle(element).color);
  const februaryLabel = reading.getByText("融冬二月", { exact: true });
  const darkMonthColor = await color(februaryLabel);
  const december = page.getByRole("region", { name: "12 月", exact: true });
  const decemberTick = december.getByRole("heading", {
    name: "12 月",
    exact: true,
  });
  const tickRotation = (locator: Locator) =>
    locator.evaluate((element) => getComputedStyle(element, "::before").rotate);
  expect(await tickRotation(year("2025"))).not.toBe(
    await tickRotation(decemberTick),
  );
  await expect(december.getByText("Short comment body")).toBeVisible();
  const cover = december.getByRole("img");
  await expect(cover).toBeVisible();
  const coverLink = december.getByRole("link", {
    name: coverName,
    exact: true,
  });
  await expect(coverLink).toHaveAttribute("href", "https://example.com/cover");
  await expect(coverLink.getByText("封面简介")).toBeVisible();
  const coverTitle = coverLink.getByRole("heading", { name: coverName });
  expect
    .soft(
      await coverTitle.evaluate(
        (element) => getComputedStyle(element).marginInlineStart,
      ),
    )
    .toBe("-8px");
  const overlay = coverTitle.locator("..");
  const gradient = () =>
    overlay.evaluate((element) => getComputedStyle(element).backgroundImage);
  const darkGradient = await gradient();
  expect(darkGradient).toContain("linear-gradient");
  const imageBounds = (await cover.boundingBox())!;
  expect((await coverTitle.boundingBox())!.y).toBeGreaterThan(
    imageBounds.y + imageBounds.height / 2,
  );
  await expect(coverTitle).toHaveCSS("color", "rgb(231, 236, 234)");
  const article = page
    .getByRole("region", { name: "02 月", exact: true })
    .locator("article");
  await expect(article).toHaveCSS("color", "rgb(231, 236, 234)");
  const title = article.getByRole("link", { name: "Latest article" });
  await expect(title).toHaveCSS("color", "rgb(255, 255, 255)");
  const entry = page.locator(".timeline-item").filter({
    has: page.getByRole("link", { name: "Latest article" }),
  });
  const timestamp = entry.locator("time");
  const tick = () =>
    entry.evaluate((element) => {
      const style = getComputedStyle(element, "::before");
      return { color: style.backgroundColor, scale: style.scale };
    });
  const highlightedTick = { color: "rgb(115, 205, 185)", scale: "1.25" };
  const idleTick = { color: "rgb(11, 13, 14)", scale: "none" };
  const isDesktop = page.viewportSize()!.width >= 1024;
  const hoverSupported = await page.evaluate(
    () => matchMedia("(hover: hover)").matches,
  );
  await expect.poll(tick).toEqual(idleTick);
  if (isDesktop)
    await expect(timestamp).toHaveCSS("color", "rgb(168, 182, 178)");
  if (hoverSupported) {
    await title.hover();
    await expect(title).toHaveCSS("background-size", "100% 100%");
    await expect(title).toHaveCSS("text-decoration-line", "none");
    await expect.poll(tick).toEqual(highlightedTick);
    if (isDesktop)
      await expect(timestamp).toHaveCSS("color", "rgb(231, 236, 234)");
    await page.mouse.move(0, 0);
    await expect.poll(tick).toEqual(idleTick);
  }
  await title.focus();
  await expect(title).toBeFocused();
  await expect.poll(tick).toEqual(highlightedTick);
  if (isDesktop)
    await expect(timestamp).toHaveCSS("color", "rgb(231, 236, 234)");
  await expect(article.locator("blockquote")).toHaveCSS(
    "color",
    "rgb(168, 182, 178)",
  );
  await expect(article.locator("pre")).toHaveCSS(
    "background-color",
    "rgb(30, 37, 39)",
  );
  await expect(article.getByText("代码")).toHaveCSS(
    "color",
    "rgb(168, 182, 178)",
  );
  await showToolbarControls(page);
  await page.getByRole("button", { name: "纸张浅色主题" }).click();
  await expect(article).toHaveCSS("color", "rgb(45, 41, 34)");
  await expect(title).toHaveCSS("color", "rgb(45, 41, 34)");
  const paperMonthColor = await color(februaryLabel);
  expect(paperMonthColor).not.toBe(darkMonthColor);
  const inactiveTickColor = await color(decemberTick);
  await expect(article.locator("blockquote")).toHaveCSS(
    "color",
    "rgb(95, 88, 76)",
  );
  await expect(article.locator("pre")).toHaveCSS(
    "background-color",
    "rgb(238, 229, 213)",
  );
  await expect(article.getByText("代码")).toHaveCSS("color", "rgb(95, 88, 76)");
  await expect(december.getByRole("img")).toHaveCSS("filter", "none");
  await expect(coverTitle).toHaveCSS("color", "rgb(45, 41, 34)");
  expect(await gradient()).toContain("linear-gradient");
  expect(await gradient()).not.toBe(darkGradient);
  const card = entry.locator("div[tabindex='-1']");
  const bounds = () =>
    card.evaluate((element) => {
      const { top, height, width } = element.getBoundingClientRect();
      return { top, height, width };
    });
  const expectIconRow = async (button: Locator) => {
    await expect(button).toBeVisible();
    await expect(button.locator("svg")).toHaveCount(1);
    expect.soft(await button.textContent()).toBe("");
    expect
      .soft((await button.boundingBox())!.width)
      .toBeCloseTo((await bounds()).width, 0);
  };
  const expand = card.getByRole("button", { name: "展开全文" });
  await expectIconRow(expand);
  const collapsedHeight = (await bounds()).height;
  expect(collapsedHeight).toBeCloseTo(
    await page.evaluate(() => window.innerHeight * 0.8),
    0,
  );
  await expand.press("Enter");
  await expect(card).toBeFocused();
  expect((await bounds()).height).toBeGreaterThan(collapsedHeight);
  await expect(page.locator(".timeline-item :focus")).toContainText(
    "Latest article",
  );
  await article.getByRole("link", { name: "归档图片" }).click();
  const lightbox = page.locator(".fancybox__container");
  const close = lightbox.getByRole("button", { name: "Close", exact: true });
  await expect(close).toHaveCSS("color", "rgb(45, 41, 34)");
  await expect(close).toHaveCSS("background-color", "rgb(255, 249, 239)");
  await expect(lightbox.getByRole("img", { name: "归档图片" })).toHaveCSS(
    "filter",
    "none",
  );
  await page.keyboard.press("Escape");
  await expect(lightbox).toBeHidden();
  const collapse = card.getByRole("button", { name: "收起全文" });
  await expectIconRow(collapse);
  await collapse.scrollIntoViewIfNeeded();
  expect((await bounds()).top).toBeLessThan(0);
  await collapse.click({ position: { x: 6, y: 20 } });
  await expect(card).toBeFocused();
  await expect(expand).toBeVisible();
  await expect
    .poll(async () => (await bounds()).height)
    .toBeCloseTo(collapsedHeight, 0);
  await expect.poll(async () => (await bounds()).top).toBeGreaterThanOrEqual(0);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(page.viewportSize()!.width);

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await reading.evaluate((element) => {
    element.addEventListener("transitionrun", (event) => {
      if (!(event instanceof TransitionEvent)) return;
      const transition = `${event.target instanceof Node ? event.target.textContent : ""}:${event.propertyName}`;
      element.dataset.dateTransitions = `${element.dataset.dateTransitions ?? ""} ${transition}`;
    });
  });
  await december.locator(".timeline-item").first().scrollIntoViewIfNeeded();
  await december
    .locator(".timeline-item")
    .first()
    .evaluate((entry) => {
      window.scrollBy(0, entry.getBoundingClientRect().top - 10);
    });
  await expect(reading).toContainText("2025 年 12 月");
  for (const label of ["貳〇貳陸", "貳〇貳伍", "融冬二月", "歲末十二"]) {
    for (const property of ["opacity", "translate"]) {
      await expect(reading).toHaveAttribute(
        "data-date-transitions",
        new RegExp(`${label}:${property}`),
        { timeout: 2_000 },
      );
    }
  }
  expect(await color(reading.getByText("歲末十二", { exact: true }))).not.toBe(
    paperMonthColor,
  );
  await expect(decemberTick).toHaveCSS("color", inactiveTickColor);
  await coverLink.focus();
  await expect(cover).toHaveCSS("scale", "1.02");
  const more = page.getByRole("button", { name: "加载更多" });
  await more.scrollIntoViewIfNeeded();
  await expect(december.getByText("Archive 20", { exact: true })).toBeVisible();
  await expect(december).toHaveCount(1);
  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight),
  );
  await expect(reading).toContainText("2025 年 11 月");
  await expect(
    page.getByRole("heading", { name: "11 月", exact: true }),
  ).not.toHaveAttribute("aria-current", "true");

  await page.getByRole("button", { name: "搜索排序" }).click();
  await page.getByRole("button", { name: "按更新时间排序" }).click();
  const march = page.getByRole("region", { name: "03 月", exact: true });
  const updated = march.locator("time");
  await expect(updated).toHaveText("03/14 09:15");
  await expect(updated).toHaveAttribute("datetime", "2026-03-14T09:15:00Z");
  await expect(march.getByText("Archive 20", { exact: true })).toBeVisible();
  await page.getByRole("textbox").fill("no matches");
  await expect(
    page.getByText("没有找到相关内容", { exact: true }),
  ).toBeVisible();
  await expect(reading).toBeEmpty();
  await expect(year("2026")).toHaveCount(0);
});

for (const colorScheme of ["dark", "light"] as const) {
  test(`static first paint uses ${colorScheme} and restores saved themes`, async ({
    page,
  }) => {
    const state = await backend(page);
    state.loggedIn = false;
    state.multiPage = true;
    const reducedMotion = colorScheme === "dark" ? "no-preference" : "reduce";
    await page.emulateMedia({ colorScheme, reducedMotion });
    const nextScripts = "**/_next/static/**/*.js";
    await page.route(nextScripts, (route) => route.abort());
    const root = page.locator("html");
    const theme = colorScheme === "dark" ? "dark" : "paper";
    const other = colorScheme === "dark" ? "paper" : "dark";
    const saved = () =>
      page.evaluate(() => localStorage.getItem("timeline-theme"));
    await page.goto("/");
    await expect(root).toHaveAttribute("data-theme", theme);
    await expect(page.locator("body")).toHaveCSS(
      "background-color",
      theme === "paper" ? "rgb(245, 239, 226)" : "rgb(11, 13, 14)",
    );
    expect(await saved()).toBe(theme);
    await expect(
      page.getByRole("button", { name: "纸张浅色主题" }),
    ).toHaveCount(0);

    await page.evaluate(() =>
      localStorage.setItem("timeline-theme", "invalid"),
    );
    await page.unroute(nextScripts);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (
        message.type() === "error" &&
        /hydrat|server.rendered HTML/i.test(message.text())
      )
        errors.push(message.text());
    });
    await page.goto("/?search=fixture&orderBy=updated_at");
    await showToolbarControls(page);
    const toggle = page.getByRole("button", { name: "纸张浅色主题" });
    await expect(toggle).toHaveAttribute(
      "aria-pressed",
      String(theme === "paper"),
    );
    const publicTitle = page.getByText("PUBLIC", { exact: true });
    await expect(publicTitle).toBeVisible();
    expect(await saved()).toBe(theme);
    const card = page
      .locator(".timeline-item")
      .filter({ has: publicTitle })
      .locator("div[tabindex='-1']");
    const outline = () =>
      card.evaluate(
        (element) => getComputedStyle(element, "::after").boxShadow,
      );
    const initialOutline = await outline();
    expect(initialOutline).toContain("inset");

    await root.evaluate((element) => {
      const startTransition = document.startViewTransition;
      if (!startTransition) return;
      document.startViewTransition = (update) => {
        element.setAttribute("data-theme-requested", "true");
        const transition = startTransition.call(document, update);
        void transition.ready.then(
          () => {
            const reveal = getComputedStyle(
              element,
              "::view-transition-new(root)",
            );
            element.setAttribute("data-theme-animation", reveal.animationName);
          },
          () => {},
        );
        return transition;
      };
    });
    await page.evaluate(() => window.scrollTo(0, window.innerHeight + 100));
    const position = await page.evaluate(() => window.scrollY);
    expect(position).toBeGreaterThan(0);
    await toggle.evaluate((button) => button.focus({ preventScroll: true }));
    await page.keyboard.press("Space");
    await expect(toggle).toBeFocused();
    await expect(toggle).toHaveAttribute(
      "aria-pressed",
      String(other === "paper"),
    );
    await expect(root).toHaveAttribute("data-theme", other);
    expect(await saved()).toBe(other);
    if (reducedMotion === "reduce") {
      await expect(root).not.toHaveAttribute("data-theme-requested", "true");
    } else {
      await expect(root).toHaveAttribute(
        "data-theme-animation",
        "theme-reveal",
      );
    }
    expect(await outline()).toContain("inset");
    expect(await outline()).not.toBe(initialOutline);
    expect(await page.evaluate(() => window.scrollY)).toBe(position);
    await expect(page.getByRole("textbox")).toHaveValue("fixture");
    expect(new URL(page.url()).searchParams.get("orderBy")).toBe("updated_at");

    await page.emulateMedia({
      colorScheme: colorScheme === "dark" ? "light" : "dark",
    });
    await expect(root).toHaveAttribute("data-theme", other);
    await page.keyboard.press("Enter");
    await expect(root).toHaveAttribute("data-theme", theme);
    expect(await saved()).toBe(theme);
    expect(errors).toEqual([]);
    await page.route(nextScripts, (route) => route.abort());
    await page.reload();
    await expect(root).toHaveAttribute("data-theme", theme);
    expect(await saved()).toBe(theme);
  });
}

test("timeline requests can be retried without replacing loaded entries", async ({
  page,
}) => {
  const state = await backend(page);
  state.loggedIn = false;
  state.multiPage = true;
  state.failTimelinePage = 0;
  await page.goto("/");
  const retry = page.getByRole("button", { name: "重试加载" });
  const failure = page.getByRole("alert").filter({ hasText: "时间线加载失败" });
  await expect(
    page.locator("[data-timeline-archive]").getByRole("alert"),
  ).toHaveText("时间线加载失败");
  await expect(page.getByText("没有找到相关内容", { exact: true })).toHaveCount(
    0,
  );
  state.failTimelinePage = null;
  await retry.click();
  await expect(page.getByText("PUBLIC", { exact: true })).toBeVisible();

  state.failTimelinePage = 1;
  await page.getByRole("button", { name: "加载更多" }).scrollIntoViewIfNeeded();
  await expect(failure).toBeVisible();
  await expect(page.getByText("PUBLIC", { exact: true })).toBeVisible();
  state.failTimelinePage = null;
  await retry.click();
  await expect(page.getByText("PUBLIC-24", { exact: true })).toBeVisible();
  await expect(failure).toBeHidden();
});

test("timeline disclosures preserve keyboard focus", async ({ page }) => {
  await backend(page);
  await page.goto("/");
  const input = page.getByRole("textbox", { name: "搜索时间线" });
  const sort = page.getByRole("button", { name: "搜索排序" });
  const updated = page.getByRole("button", { name: "按更新时间排序" });
  const source = page
    .getByRole("button", { name: "feed", exact: true })
    .first();
  await input.fill("fixture");
  await page.getByRole("button", { name: "清空搜索" }).press("Enter");
  await expect(input).toHaveValue("");
  await expect(input).toBeFocused();

  await sort.press("Enter");
  await updated.press("Escape");
  await expect(sort).toBeFocused();
  await expect(updated).toBeHidden();
  await sort.press("Enter");
  await Promise.all([
    page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        url.pathname === "/timeline-items" &&
        url.searchParams.get("orderBy") === "updated_at"
      );
    }),
    updated.press("Enter"),
  ]);
  await expect(sort).toBeFocused();
  await expect(updated).toBeHidden();

  await source.press("Enter");
  const link = page.getByRole("link", { name: "打开链接", exact: true });
  await link.press("Escape");
  await expect(source).toBeFocused();
  await expect(link).toBeHidden();
  await source.press("Enter");
  await input.press("Escape");
  await expect(input).toBeFocused();
  await expect(link).toBeHidden();
});

test("album navigation supports touch, visible indicators, and source actions", async ({
  page,
}, testInfo) => {
  const state = await backend(page);
  state.archiveItems = [
    {
      id: "album",
      content_id: "album",
      sync_service_id: "album",
      sync_service_type: SyncServiceType.QZONE_TALK,
      label: "相册",
      title: "Album",
      content: "",
      url: "https://example.com/album",
      created_at: "2026-10-03T01:00:00Z",
      updated_at: "2026-10-03T01:00:00Z",
      attachments: ["one.svg", "two.svg"].map((filename) => ({
        filename,
        url: COVER_URL,
      })),
    },
  ];
  await page.goto("/");
  const first = page.getByRole("button", { name: "跳转到第 1 张" });
  const second = page.getByRole("button", { name: "跳转到第 2 张" });
  await expect(first).toBeVisible();
  await expect(first.locator("..")).toHaveCSS("opacity", "1");
  await expect(first).toHaveAttribute("aria-current", "true");
  if (testInfo.project.use.hasTouch) {
    const image = page.getByRole("button", { name: "查看第 1 张图片" });
    await image.scrollIntoViewIfNeeded();
    const bounds = (await image.boundingBox())!;
    const x = Math.round(bounds.x + bounds.width / 2);
    const y = Math.round(bounds.y + bounds.height / 2);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y }],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: x - 75, y }],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await cdp.detach();
  } else {
    await page.getByRole("button", { name: "下一张" }).click();
  }
  await expect(second).toHaveAttribute("aria-current", "true");
  await expect(page.getByRole("button", { name: "上一张" })).toBeVisible();
  await expect(page.locator(".fancybox__container")).toBeHidden();

  await first.click();
  await expect(first).toHaveAttribute("aria-current", "true");
  await page.getByRole("button", { name: "查看第 1 张图片" }).click();
  const lightbox = page.locator(".fancybox__container");
  await expect(lightbox).toBeVisible();
  await lightbox.getByRole("button", { name: /next/i }).click();
  await lightbox.getByRole("button", { name: "Close", exact: true }).click();
  await expect(second).toHaveAttribute("aria-current", "true");

  await page.getByRole("button", { name: "相册", exact: true }).click();
  await page.getByRole("button", { name: "设为私密" }).click();
  await page.getByRole("button", { name: "确认", exact: true }).click();
  await expect(page.getByText("私密", { exact: true })).toBeVisible();
});

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
  for (const name of ["退出登录", "关闭管理面板"]) {
    await expect(panel.getByRole("button", { name })).toBeInViewport();
  }
  await expect(panel.getByText("访客预览", { exact: true })).toHaveCount(0);
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
  const siteLinks = page.getByRole("list", { name: "站点链接" });
  if (await siteLinks.isVisible()) {
    const button = (await backToTop.boundingBox())!;
    const links = (await siteLinks.boundingBox())!;
    expect(button.y + button.height).toBeCloseTo(links.y + links.height);
  }
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
  await recordDialogMotion(page);
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
  const motion = page.viewportSize()!.width >= 1024 ? "translate" : "scale";
  await expect(panel).toHaveAttribute("data-motion", new RegExp(motion));
  await expect(panel).toHaveAttribute("data-motion", /opacity::backdrop/);
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

  const filter = panel.getByRole("combobox", { name: "同步任务" });
  await filter.selectOption({ label: "博客(feed)" });
  await expect(panel.getByText("新增或更新 3 条")).toBeVisible();
  await expect(panel.getByText("新增或更新 0 条")).toHaveCount(0);
  await filter.selectOption({ label: "博客(empty)" });
  await expect(panel.getByText("新增或更新 0 条")).toBeVisible();
  await expect(panel.getByText("新增或更新 3 条")).toHaveCount(0);
  expect(timelineReads()).toBe(initialReads + 1);

  const scheduled = state.run!;
  state.run = null;
  state.history = Array.from({ length: 10 }, (_, index) => ({
    ...scheduled,
    id: `scheduled-${index}`,
  }));
  await expect(panel.getByText("当前任务尚无同步记录。")).toBeVisible();
  await expect.poll(itemReads).toBe(before + 2);
  await filter.selectOption({ label: "全部任务" });
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
  await page.goto("/?search=fixture%20type:feed&orderBy=updated_at");
  await expect(page.getByText("PRIVATE", { exact: true })).toBeVisible();
  const themeToggle = page.getByRole("button", {
    name: "纸张浅色主题",
    includeHidden: true,
  });
  const previewToggle = page.getByRole("button", {
    name: /^(访客预览|管理员模式)$/,
    includeHidden: true,
  });
  const menuTrigger = page.getByRole("button", { name: "时间线菜单" });
  const reading = page.getByRole("group", { name: "当前阅读年月" });
  await expect(reading).toContainText("2026 年 11 月");
  await showToolbarControls(page);
  if ((await themeToggle.getAttribute("aria-pressed")) === "false")
    await themeToggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "paper");
  await expect(previewToggle).toHaveAccessibleName("管理员模式");
  const themeBounds = (await themeToggle.boundingBox())!;
  const previewBounds = (await previewToggle.boundingBox())!;
  expect(previewBounds.x).toBe(themeBounds.x);
  expect(previewBounds.y).toBeGreaterThanOrEqual(
    themeBounds.y + themeBounds.height,
  );
  await previewToggle.press("Space");
  await expect(
    page.viewportSize()!.width < 640 ? menuTrigger : previewToggle,
  ).toBeFocused();
  await showToolbarControls(page);
  await expect(previewToggle).toHaveAccessibleName("访客预览");
  await expect(page.getByRole("region", { name: "访客预览" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "退出登录" })).toHaveCount(0);
  await expect(themeToggle).toHaveAttribute("aria-pressed", "true");
  await expect(reading).toContainText("2026 年 10 月");
  await expect(page.getByText("PRIVATE", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("textbox").filter({ visible: true })).toHaveValue(
    "fixture",
  );
  expect(state.loggedIn).toBe(true);
  expect(
    state.requests.filter((request) => request.path === "/logout"),
  ).toHaveLength(0);
  await page.getByRole("button", { name: "feed", exact: true }).first().click();
  await expect(page.getByRole("link", { name: "打开链接" })).toBeVisible();
  await expect(page.getByRole("button", { name: "设为私密" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "删除", exact: true }),
  ).toHaveCount(0);
  await showToolbarControls(page);
  await previewToggle.click();
  await expect(
    page.viewportSize()!.width < 640 ? menuTrigger : previewToggle,
  ).toBeFocused();
  await showToolbarControls(page);
  await expect(previewToggle).toHaveAccessibleName("管理员模式");
  await expect(page.getByText("PRIVATE", { exact: true })).toBeVisible();
  await expect(themeToggle).toHaveAttribute("aria-pressed", "true");
  await expect(reading).toContainText("2026 年 11 月");
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
    expect(request.serviceLabel).toBe("feed");
    expect(request.orderBy).toBe("updated_at");
  }
  await showToolbarControls(page);
  await previewToggle.click();
  await page.reload();
  await expect(page.getByText("PRIVATE", { exact: true })).toBeVisible();
  await expect(previewToggle).toHaveAttribute("aria-label", "管理员模式");
  await page.setViewportSize({ width: 320, height: 844 });
  await expect(previewToggle).toBeHidden();
  await expect(themeToggle).toBeHidden();
  await showToolbarControls(page);
  await expect(previewToggle).toBeInViewport();
  await expect(previewToggle.locator("span")).toBeVisible();
  await expect(previewToggle).toHaveCSS("border-width", "0px");
  await expect(themeToggle).toHaveCSS("border-width", "0px");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    320,
  );
  await page.keyboard.press("Escape");
  await expect(menuTrigger).toBeFocused();
  for (const width of [640, 767, 768, 1023]) {
    await page.setViewportSize({ width, height: 844 });
    for (const control of [themeToggle, previewToggle]) {
      await expect(control).toHaveCount(1);
      await expect(control).toBeInViewport();
      if (width < 768) {
        await expect(control.locator("span")).toBeHidden();
        expect((await control.boundingBox())!.width).toBe(44);
      } else await expect(control.locator("span")).toBeVisible();
    }
    await expect(themeToggle).toHaveAttribute("aria-pressed", "true");
    const themeBounds = (await themeToggle.boundingBox())!;
    const previewBounds = (await previewToggle.boundingBox())!;
    expect(previewBounds.x).toBeGreaterThanOrEqual(
      themeBounds.x + themeBounds.width,
    );
    expect(previewBounds.y).toBe(themeBounds.y);
    if (await menuTrigger.isVisible())
      expect((await menuTrigger.boundingBox())!.y).toBe(themeBounds.y);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width);
  }
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
    const previewToggle = page.getByRole("button", {
      name: /^(访客预览|管理员模式)$/,
      includeHidden: true,
    });
    if (transition === "preview") {
      await panel.getByRole("button", { name: "关闭管理面板" }).click();
      await showToolbarControls(page);
      await previewToggle.click();
    } else if (transition === "logout")
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
      page.getByRole("group", { name: "当前阅读年月" }),
    ).toContainText(/\d{4} 年 \d{2} 月/);
    if (transition === "preview") {
      await showToolbarControls(page);
      await expect(previewToggle).toHaveAccessibleName("访客预览");
      expect(state.loggedIn).toBe(true);
    } else await expect(previewToggle).toHaveCount(0);
  });
}

test("unknown acceptance is reconciled with GET and closing the panel stops polling without cancelling work", async ({
  page,
}) => {
  const state = await backend(page);
  state.loseAcceptance = true;
  await page.goto("/");
  const entry = page.getByRole("button", { name: "管理面板", exact: true });
  await entry.click();
  const panel = page.getByRole("dialog");
  await panel.getByRole("button", { name: "开始同步" }).click();
  await expect(panel.getByRole("status")).toContainText("受理结果未知");
  await expect(panel.getByRole("button", { name: "开始同步" })).toBeDisabled();
  const heading = (await panel
    .getByRole("heading", { name: "管理面板" })
    .boundingBox())!;
  await page.mouse.move(heading.x + 10, heading.y + 10);
  await page.mouse.down();
  await page.mouse.move(1, 1);
  await page.mouse.up();
  await expect(panel).toBeVisible();
  await page.mouse.click(1, 1);
  await expect(panel).not.toBeVisible();
  await expect(entry).toBeFocused();
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

test("native login modal traps focus and cleans up each dismissal", async ({
  page,
}) => {
  const state = await backend(page);
  state.loggedIn = false;
  await recordDialogMotion(page);

  for (const dismissal of ["escape", "button", "backdrop"]) {
    const reduced = dismissal === "button";
    await page.emulateMedia({
      reducedMotion: reduced ? "reduce" : "no-preference",
    });
    await page.goto("/?login&search=fixture#timeline");
    const dialog = page.getByRole("dialog", { name: "管理员登录" });
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate((element) => element.matches(":modal"))).toBe(
      true,
    );
    if (reduced) {
      await expect(dialog).toHaveCSS("transition-duration", "0s");
    } else {
      await expect(dialog).toHaveAttribute("data-motion", /scale/);
      await expect(dialog).toHaveAttribute("data-motion", /opacity::backdrop/);
    }

    const username = dialog.getByRole("textbox", { name: "用户名" });
    const search = page.locator('input[aria-label="搜索时间线"]');
    await expect(search).toBeAttached();
    await username.focus();
    await search.evaluate((element) => element.focus());
    await expect(username).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(dialog.getByLabel("密码", { exact: true })).toBeFocused();

    if (dismissal === "escape") await page.keyboard.press("Escape");
    else if (dismissal === "button")
      await dialog.getByRole("button", { name: "关闭登录" }).click();
    else await page.mouse.click(1, 1);

    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/\?search=fixture#timeline$/);
  }
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
  const dialog = page.getByRole("dialog", { name: "管理员登录" });
  await dialog.getByLabel("用户名").fill("test");
  await dialog.getByLabel("密码").fill("test");
  await dialog.getByRole("button", { name: "登 录", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
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

test("inline confirmation updates the cache only for confirmed admin actions", async ({
  page,
}) => {
  const state = await backend(page);
  const nativeDialogs: string[] = [];
  page.on("dialog", (dialog) => {
    nativeDialogs.push(dialog.type());
    void dialog.dismiss();
  });
  await page.goto("/");
  const item = page
    .locator(".timeline-item")
    .filter({ has: page.getByText("PRIVATE", { exact: true }) });
  const source = item.getByRole("button", { name: "feed", exact: true });
  const confirm = item.getByRole("button", { name: "确认", exact: true });
  const cancel = item.getByRole("button", { name: "取消", exact: true });
  const remove = item.getByRole("button", { name: "删除", exact: true });
  const requestCount = (method: string) =>
    state.requests.filter(
      (request) =>
        request.path === "/timeline-items/PRIVATE" && request.method === method,
    ).length;

  await source.click();
  await item.getByRole("button", { name: "设为公开", exact: true }).click();
  await expect(cancel).toBeFocused();
  expect(requestCount("PATCH")).toBe(0);
  await confirm.click();
  await expect(source).toBeFocused();
  await expect(item.getByText("私密", { exact: true })).toHaveCount(0);
  await source.click();
  await expect(
    item.getByRole("button", { name: "设为私密", exact: true }),
  ).toBeVisible();
  expect(requestCount("PATCH")).toBe(1);

  await remove.click();
  await cancel.click();
  await expect(remove).toBeVisible();
  await remove.click();
  await page.keyboard.press("Escape");
  await expect(source).toBeFocused();
  await expect(confirm).toBeHidden();
  await source.click();
  await remove.click();
  await page.getByRole("heading", { name: "2026", exact: true }).click();
  await expect(confirm).toBeHidden();
  expect(requestCount("DELETE")).toBe(0);

  await source.click();
  await remove.click();
  await confirm.click();
  await expect(item).toHaveCount(0);
  expect(requestCount("DELETE")).toBe(1);
  expect(nativeDialogs).toEqual([]);
});
