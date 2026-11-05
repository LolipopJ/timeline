import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { SyncRunDto, TimelineItemClient } from "@timeline/contracts";
import { SyncServiceType } from "@timeline/contracts";

import clientConfig from "../configs/client";

test.use({ timezoneId: "UTC" });
const COVER_URL =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='640' height='360'%3E%3Crect width='640' height='360' fill='tomato'/%3E%3C/svg%3E";

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
    failTimelinePage: null as number | null,
    multiPage: false,
    archiveItems: null as TimelineItemClient[] | null,
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

async function showToolbarControls(page: Page) {
  const theme = page.getByRole("button", {
    name: "纸张浅色主题",
    includeHidden: true,
  });
  await expect(theme).toBeAttached();
  if (await theme.isHidden())
    await page.getByRole("button", { name: "时间线菜单" }).click();
}

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
  state.archiveItems = [
    {
      ...latest,
      content: `${latest.content}\n\n<img src="${COVER_URL}" alt="归档图片">\n\n${"长文段落。\n\n".repeat(30)}`,
    },
    {
      ...item("Cover story", "2025-12-27T11:45:00Z"),
      sync_service_id: "video",
      sync_service_type: SyncServiceType.BILIBILI_COLLECTION,
      attachments: [
        {
          filename: "cover.svg",
          url: COVER_URL,
        },
      ],
      content: null,
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
  await expect(december.getByRole("img")).toBeVisible();
  const coverTitle = december.getByRole("heading", { name: "Cover story" });
  const coverBackground = (locator: Locator) =>
    locator.evaluate((element) => getComputedStyle(element).backgroundColor);
  const darkCoverBackground = await coverBackground(coverTitle);
  await expect(coverTitle).toHaveCSS("color", "rgb(255, 255, 255)");
  await expect(coverTitle).toHaveCSS("border-bottom-width", "0px");
  const article = page
    .getByRole("region", { name: "02 月", exact: true })
    .locator("article");
  await expect(article).toHaveCSS("color", "rgb(231, 236, 234)");
  const title = article.getByRole("link", { name: "Latest article" });
  await expect(title).toHaveCSS("color", "rgb(255, 255, 255)");
  const hoverSupported = await page.evaluate(
    () => matchMedia("(hover: hover)").matches,
  );
  if (hoverSupported) {
    await title.hover();
    await expect(title).toHaveCSS("background-size", "100% 100%");
    await expect(title).toHaveCSS("text-decoration-line", "none");
  }
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
  await expect(coverTitle).toHaveCSS(
    "border-bottom-color",
    "rgb(216, 205, 186)",
  );
  expect(await coverBackground(coverTitle)).not.toBe(darkCoverBackground);
  const expand = page.getByRole("button", { name: "展开全文" });
  await expand.press("Enter");
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
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(page.viewportSize()!.width);

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await reading.evaluate((element) => {
    element.addEventListener("transitionrun", (event) => {
      if (!(event instanceof TransitionEvent)) return;
      const transition = `${event.target instanceof Node ? event.target.textContent : ""}:${event.propertyName}`;
      element.dataset.monthTransitions = `${element.dataset.monthTransitions ?? ""} ${transition}`;
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
  for (const label of ["融冬二月", "歲末十二"]) {
    for (const property of ["opacity", "translate"]) {
      await expect(reading).toHaveAttribute(
        "data-month-transitions",
        new RegExp(`${label}:${property}`),
        { timeout: 2_000 },
      );
    }
  }
  expect(await color(reading.getByText("歲末十二", { exact: true }))).not.toBe(
    paperMonthColor,
  );
  await expect(decemberTick).toHaveCSS("color", inactiveTickColor);
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
    await page.emulateMedia({ colorScheme });
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
    await expect(page.getByText("PUBLIC", { exact: true })).toBeVisible();
    expect(await saved()).toBe(theme);
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
  await expect(failure).toBeVisible();
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
  await updated.press("Enter");
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

test("album navigation does not cover source actions", async ({ page }) => {
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
  await page.getByRole("button", { name: "下一张" }).click();
  await expect(page.getByRole("button", { name: "上一张" })).toBeVisible();
  await page.getByRole("button", { name: "相册", exact: true }).click();
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "设为私密" }).click();
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
    expect(request.serviceId).toBe("feed");
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
  await item.getByRole("button", { name: "feed", exact: true }).click();
  page.once("dialog", (dialog) => void dialog.accept());
  await item.getByRole("button", { name: "设为公开", exact: true }).click();
  await expect(item.getByText("私密", { exact: true })).toHaveCount(0);
  await item.getByRole("button", { name: "feed", exact: true }).click();
  await expect(
    item.getByRole("button", { name: "设为私密", exact: true }),
  ).toBeVisible();
  expect(
    state.requests.filter((request) => request.method === "PATCH"),
  ).toHaveLength(1);
});
