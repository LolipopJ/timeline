import "reflect-metadata";

import { cors } from "@elysiajs/cors";
import { staticPlugin } from "@elysiajs/static";
import type {
  BatchTimelineItemsParams,
  CollectionTreeDto,
  CountTimelineItemsParams,
  CreateCollectionParams,
  GetTimelineItemsParams,
  ItemCollectionsDto,
  LoginParams,
  LoginStatus,
  MergeCollectionParams,
  MoveCollectionParams,
  RenameCollectionParams,
  StartSyncParams,
  SyncRejectedDto,
  UpdateTimelineItemParams,
} from "@timeline/contracts";
import { SyncServiceType, TIMELINE_VIEW_HEADER } from "@timeline/contracts";
import { Elysia, StatusMap } from "elysia";
import type { Cookie, ElysiaCookie } from "elysia/cookies";
import fs from "fs";
import schedule from "node-schedule";
import { z } from "zod";

import { getAdminLogs, getAdminSyncStatus, requestAdminSync } from "./admin";
import {
  serializeTimelineCollection,
  serializeTimelineItem,
} from "./api/serializers";
import {
  getTimelineServiceLabel,
  getTimelineServiceLabels,
  getTimelineWhere,
  hasAdminTimelineView,
  isCollectionFilterId,
  isTimelineServiceLabel,
  isTimelineView,
  isUuid,
} from "./api/timeline-query";
import config from "./config";
import { SERVER_STATIC_DIR, SERVER_TEMPORARY_DIR } from "./constants";
import { destroyDatabase, initializeDatabase } from "./database";
import {
  createTimelineCollection,
  deleteTimelineCollection,
  getItemCollectionIds,
  getTimelineCollectionLabels,
  getTimelineCollectionTree,
  mergeTimelineCollection,
  moveTimelineCollection,
  renameTimelineCollection,
  saveItemCollectionIds,
} from "./database/controller/timeline-collection";
import {
  applyTimelineItemBatch,
  countTimelineItems,
  getTimelineItems,
  getTimelineServiceIds,
  restoreSoftDeletedTimelineItem,
  softDeleteTimelineItem,
  updateTimelineItem,
} from "./database/controller/timeline-item";
import { syncCoordinator } from "./sync";
import { saveBilibiliSessionData } from "./utils/bilibili";
import { checkupDir } from "./utils/file";
import { JWT } from "./utils/jwt";
import { createLogger, formatError, formatRequestUrl } from "./utils/logger";
import {
  generateQZoneLoginQRCode,
  getQZoneQRCodeFilePath,
  pollGetQZoneLoginQRCodeScanResult,
} from "./utils/qzone";

const logger = createLogger("Server");

const PORT = Number(config.listeningPort ?? 4000);

const ALLOWED_ORIGIN = config.allowedOrigin ?? true;

const SYNC_INTERVAL = config.syncInterval ?? "*/30 * * * *";

const IS_DEVELOPMENT = process.env.NODE_ENV === "development";

// 启动时设置环境变量 `FULL_SYNC=true` 可触发一次全量同步，后续定时任务仍按增量同步执行
const IS_FULL_SYNC_ON_START = process.env["FULL_SYNC"] === "true";

const JWT_SECRET_KEY = config.admin?.secretKey;
const ADMIN_ACCOUNTS = config.admin?.accounts ?? [];
const IS_ADMIN_ENABLED = JWT_SECRET_KEY && ADMIN_ACCOUNTS.length;
const COOKIE_TOKEN_KEY = "access-token";
const jwt = new JWT(JWT_SECRET_KEY ?? "won't used");

interface SensitiveRoute {
  method: string;
  pattern: RegExp;
}

const ITEM_COLLECTIONS_ROUTE = /^\/timeline-items\/[^/]+\/collections$/;
const BATCH_ITEMS_ROUTE = /^\/timeline-items\/batch$/;
const TIMELINE_VIEW_ROUTES = new Set([
  "/timeline-items",
  "/timeline-items/count",
  "/timeline-services",
  "/timeline-collections",
]);

const createCollectionSchema = z.object({
  name: z.string().trim().min(1),
  parentId: z.guid().nullable(),
}) satisfies z.ZodType<CreateCollectionParams>;
const renameCollectionSchema = z.object({
  name: z.string().trim().min(1),
}) satisfies z.ZodType<RenameCollectionParams>;
const moveCollectionSchema = z.object({
  parentId: z.guid().nullable(),
}) satisfies z.ZodType<MoveCollectionParams>;
const mergeCollectionSchema = z.object({
  targetId: z.guid().nullable(),
}) satisfies z.ZodType<MergeCollectionParams>;
const itemCollectionsSchema = z.object({
  collectionIds: z.array(z.guid()),
}) satisfies z.ZodType<ItemCollectionsDto>;

const batchItemIdsSchema = z.array(z.guid()).min(1);
const batchTimelineItemsSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("make-private"), itemIds: batchItemIdsSchema }),
  z.object({ action: z.literal("delete"), itemIds: batchItemIdsSchema }),
  z.object({
    action: z.enum(["add-collections", "remove-collections"]),
    itemIds: batchItemIdsSchema,
    collectionIds: z.array(z.guid()).min(1),
  }),
]) satisfies z.ZodType<BatchTimelineItemsParams>;
const startSyncSchema = z.strictObject({
  serviceIds: z.array(z.string().min(1)).min(1),
}) satisfies z.ZodType<StartSyncParams>;

const SENSITIVE_ROUTES: SensitiveRoute[] = [
  { method: "POST", pattern: BATCH_ITEMS_ROUTE },
  { method: "POST", pattern: /^\/timeline-collections$/ },
  { method: "PATCH", pattern: /^\/timeline-collections\/[^/]+\/name$/ },
  { method: "PATCH", pattern: /^\/timeline-collections\/[^/]+\/parent$/ },
  { method: "POST", pattern: /^\/timeline-collections\/[^/]+\/merge$/ },
  { method: "DELETE", pattern: /^\/timeline-collections\/[^/]+$/ },
  { method: "GET", pattern: ITEM_COLLECTIONS_ROUTE },
  { method: "PATCH", pattern: ITEM_COLLECTIONS_ROUTE },
  { method: "GET", pattern: /^\/admin\/sync$/ },
  { method: "POST", pattern: /^\/admin\/sync$/ },
  { method: "GET", pattern: /^\/admin\/logs$/ },
  { method: "GET", pattern: /^\/qzone-login$/ },
  { method: "GET", pattern: /^\/set$/ },
  { method: "PATCH", pattern: /^\/timeline-items\/[^/]+$/ },
  { method: "DELETE", pattern: /^\/timeline-items\/[^/]+$/ },
  { method: "POST", pattern: /^\/timeline-items\/[^/]+\/restore$/ },
];

const isSensitiveRoute = (method: string, path: string) =>
  SENSITIVE_ROUTES.some(
    (route) => route.method === method && route.pattern.test(path),
  );

const COOKIE_OPTIONS: Partial<ElysiaCookie> = {
  httpOnly: true,
  ...(IS_DEVELOPMENT
    ? { sameSite: "none", secure: true }
    : { sameSite: "strict" }),
};

const clearCookieToken = (cookieToken: Cookie<unknown>) => {
  cookieToken.set({
    ...COOKIE_OPTIONS,
    value: "",
    expires: new Date(0),
    maxAge: 0,
  });
};

/** 等待在途同步任务结束的最长时间，避免 ffmpeg 转换等长任务无限拖住退出 */
const TEARDOWN_TIMEOUT_MS = 5_000;

/** 等待日志缓冲排空的最长时间 */
const LOG_FLUSH_TIMEOUT_MS = 1_000;

const withTimeout = (promise: Promise<unknown>, timeoutMs: number) =>
  Promise.race([
    promise,
    new Promise<void>((resolve) => {
      setTimeout(resolve, timeoutMs).unref();
    }),
  ]);

const doTeardown = async (reason: string) => {
  syncCoordinator.stop();
  logger.info(`Releasing resources (${reason})...`);

  try {
    Object.values(schedule.scheduledJobs).forEach((job) => {
      job.cancel();
    });
    logger.info("Scheduled tasks cancelled.");
  } catch (error) {
    logger.error(`Cancel scheduled tasks failed:\n${formatError(error)}`);
  }

  if (syncCoordinator.snapshot().current) {
    logger.info(
      `Waiting up to ${TEARDOWN_TIMEOUT_MS}ms for the running sync...`,
    );
    await withTimeout(syncCoordinator.wait(), TEARDOWN_TIMEOUT_MS);
  }

  await destroyDatabase();
};

let teardownPromise: Promise<void> | undefined;

/**
 * 停止定时任务并释放数据库连接，可重复调用。
 *
 * 重复调用返回**同一个 promise**：`uncaughtException` 与信号处理器可能接连触发，
 * 若只在开头用布尔标记拦截，第二次调用会立刻返回，导致调用方在
 * `destroyDatabase()` 完成前就退出进程。
 *
 * 不使用 `schedule.gracefulShutdown()`：它每 500ms 轮询且从不超时，
 * 并且其内部的 `setInterval` 在完成后不会被清除，会永久持有事件循环。
 */
const teardown = (reason: string) => {
  teardownPromise ??= doTeardown(reason);
  return teardownPromise;
};

/** 排空单个输出流，避免 `process.exit()` 截断缓冲 */
const flushStream = (stream: NodeJS.WriteStream) =>
  new Promise<void>((resolve) => stream.write("", () => resolve()));

/**
 * 等待 stdout 与 stderr 缓冲排空。
 * `logger.error` 走 `console.error`（stderr），只 flush stdout 会漏掉退出前最关键的日志。
 */
const flushStdio = () =>
  withTimeout(
    Promise.all([flushStream(process.stdout), flushStream(process.stderr)]),
    LOG_FLUSH_TIMEOUT_MS,
  );

/**
 * 关闭 HTTP 监听。
 * 在 `onStart` 的异步初始化之前绑定，启动失败时也能关闭监听。
 */
let stopHttpServer: () => Promise<void> = async () => undefined;

/**
 * 记录异常、释放资源后以非零状态退出。
 *
 * 顺序很关键：
 * 1. 先停 HTTP 接入，再执行 `teardown()`。`teardown()` 末尾会 `destroyDatabase()`，
 *    若此时仍在接收请求，新请求会撞上已释放的 DataSource 并再次进入 `onError`。
 * 2. 全程包在 try/finally 中。`stopHttpServer()` 可能因连接状态异常而失败，
 *    若让异常逃逸，调用方的 `void exitWithError(...)` 会触发 `unhandledRejection`，
 *    再次进入本函数并在同一处失败，形成永不退出的回环。
 *
 * 必须显式调用 `process.exit()`：`process.exitCode` 只是设定退出码，
 * 只要还有未 `unref` 的定时器或句柄（如 JWT 缓存清理、QQ 空间登录轮询），
 * 事件循环就不会清空，进程会变成"不再监听端口但也不退出"的僵尸进程。
 */
const exitWithError = async (reason: string, error: unknown) => {
  logger.error(`${reason}:\n${formatError(error)}`);

  try {
    await stopHttpServer();
    await teardown(reason);
  } catch (cleanupError) {
    logger.error(`Releasing resources failed:\n${formatError(cleanupError)}`);
  } finally {
    await flushStdio();
    process.exit(1);
  }
};

export const app = new Elysia()
  .use(
    cors({
      origin: ALLOWED_ORIGIN,
      credentials: true,
      exposeHeaders: [TIMELINE_VIEW_HEADER],
    }),
  )
  .use(
    staticPlugin({
      assets: SERVER_STATIC_DIR,
      prefix: "/static",
      alwaysStatic: false,
      staticLimit: 0,
      decodeURI: true,
      maxAge: 60 * 60 * 24 * 7,
    }),
  )
  .onError(({ code, error, request, set }) => {
    // 404 属于正常的业务响应，记录为错误会淹没真正的异常
    if (code === "NOT_FOUND") return;

    // Elysia 在调用 onError 前会把 set.status 赋值为 error.status ?? 500；
    // 仅在路由主动写入状态名时它才不是数字，因此这里兜底转换
    const status =
      typeof set.status === "number"
        ? set.status
        : ((set.status && StatusMap[set.status]) ?? 500);

    logger.error(
      [
        `An error occurred while resolving request \`${request.method} ${formatRequestUrl(request.url)}\` (code: ${code}, status: ${status}):`,
        formatError(error),
      ].join("\n"),
    );
  })
  .onBeforeHandle(
    ({
      path,
      request,
      query,
      cookie: { [COOKIE_TOKEN_KEY]: cookieToken },
      set,
    }) => {
      const routePath = path.replace(/\/$/, "");
      if (
        routePath.startsWith("/admin/") ||
        TIMELINE_VIEW_ROUTES.has(routePath) ||
        routePath.startsWith("/timeline-collections/") ||
        ITEM_COLLECTIONS_ROUTE.test(routePath) ||
        BATCH_ITEMS_ROUTE.test(routePath) ||
        routePath === "/login"
      ) {
        set.headers["cache-control"] = "private, no-store";
      }
      let isCookieValidated = false;
      if (IS_ADMIN_ENABLED) {
        // 服务端启用了管理员功能，在正式处理请求前校验登录态 Cookie
        if (cookieToken.value) {
          try {
            // 若校验通过，后续路由可以通过 cookieToken.value 值是否为空来判断是否已登录
            jwt.verify(String(cookieToken.value));
            isCookieValidated = true;
          } catch (error) {
            // 校验不通过，清除 cookieToken.value
            logger.warn(
              `请求包含不合法的用户 Token（通常为登录态过期或 \`secretKey\` 变更），已清除该 Cookie。\n${formatError(error)}`,
            );
            clearCookieToken(cookieToken);
          }
        }

        // 如登录态 Cookie 校验不通过，拦截敏感操作路由
        if (!isCookieValidated && isSensitiveRoute(request.method, routePath)) {
          set.status = 401;
          return "您未登录，或登录态已过期";
        }
      } else {
        // 服务端未启用管理员功能
        if (
          // 拦截登录、登出路由，但放行查询登录状态的 GET /login
          ((path === "/login" || path === "/logout") &&
            request.method !== "GET") ||
          // 拦截敏感操作路由
          isSensitiveRoute(request.method, routePath)
        ) {
          set.status = 400;
          return "管理员功能未启用";
        }
      }
      if (
        !isCookieValidated &&
        query["view"] === "admin" &&
        request.method === "GET" &&
        TIMELINE_VIEW_ROUTES.has(routePath)
      ) {
        set.headers[TIMELINE_VIEW_HEADER] = "public";
      }
    },
  )
  .get("/admin/sync", ({ query, set }) => {
    const { serviceId } = query;
    if (serviceId !== undefined && typeof serviceId !== "string") {
      set.status = 400;
      return "同步任务筛选参数无效";
    }
    return getAdminSyncStatus(serviceId);
  })
  .get("/admin/logs", ({ query, set }) => {
    const result = getAdminLogs(query);
    set.status = result.status;
    return result.body;
  })
  .post("/admin/sync", ({ body, set }) => {
    const selection = startSyncSchema.safeParse(body);
    if (!selection.success) {
      set.status = 400;
      return { reason: "invalid_selection" } satisfies SyncRejectedDto;
    }
    const result = requestAdminSync(selection.data);
    set.status = result.status;
    return result.body;
  })
  //#region 时间线接口
  .get(
    "/timeline-collections",
    async ({ query, cookie: { [COOKIE_TOKEN_KEY]: cookieToken }, set }) => {
      const { view } = query;
      if (!isTimelineView(view)) {
        set.status = 400;
        return "时间线视角参数无效";
      }

      const isAdmin = Boolean(IS_ADMIN_ENABLED && cookieToken.value);
      const { totalCount, uncategorizedCount, nodes } =
        await getTimelineCollectionTree(
          getTimelineWhere({ view }, isAdmin),
          hasAdminTimelineView(view, isAdmin),
        );
      return {
        totalCount,
        uncategorizedCount,
        nodes: nodes.map((node) =>
          serializeTimelineCollection(node, node.item_count),
        ),
      } satisfies CollectionTreeDto;
    },
  )
  .post("/timeline-collections", async ({ body, set }) => {
    const input = createCollectionSchema.safeParse(body);
    if (!input.success) {
      set.status = 400;
      return "合集名称或父级无效";
    }

    const node = await createTimelineCollection(
      input.data.name,
      input.data.parentId,
    );
    if (!node) {
      set.status = 400;
      return "父级合集不存在";
    }

    set.status = 201;
    return serializeTimelineCollection(node, 0);
  })
  .patch(
    "/timeline-collections/:id/parent",
    async ({ params: { id }, body, set }) => {
      const input = moveCollectionSchema.safeParse(body);
      if (!isUuid(id) || !input.success) {
        set.status = 400;
        return "合集 ID 或父级无效";
      }

      const result = await moveTimelineCollection(id, input.data.parentId);
      if (result === "missing-collection") {
        set.status = 404;
        return "合集不存在";
      }
      if (result === "missing-parent" || result === "cycle") {
        set.status = 400;
        return result === "cycle"
          ? "不能将合集移到自身或后代下"
          : "父级合集不存在";
      }

      set.status = 204;
    },
  )
  .patch(
    "/timeline-collections/:id/name",
    async ({ params: { id }, body, set }) => {
      const input = renameCollectionSchema.safeParse(body);
      if (!isUuid(id) || !input.success) {
        set.status = 400;
        return "合集 ID 或名称无效";
      }

      const renamed = await renameTimelineCollection(id, input.data.name);
      if (!renamed) {
        set.status = 404;
        return "合集不存在";
      }

      set.status = 204;
    },
  )
  .post(
    "/timeline-collections/:id/merge",
    async ({ params: { id }, body, set }) => {
      const input = mergeCollectionSchema.safeParse(body);
      if (!isUuid(id) || !input.success) {
        set.status = 400;
        return "合集 ID 或目标合集无效";
      }

      const result = await mergeTimelineCollection(id, input.data.targetId);
      if (result === "missing-collection") {
        set.status = 404;
        return "合集不存在";
      }
      if (result === "missing-target" || result === "invalid-target") {
        set.status = 400;
        return result === "invalid-target"
          ? "不能合并到自身或子合集"
          : "目标合集不存在";
      }

      set.status = 204;
    },
  )
  .delete("/timeline-collections/:id", async ({ params: { id }, set }) => {
    if (!isUuid(id)) {
      set.status = 400;
      return "合集 ID 无效";
    }

    const deleted = await deleteTimelineCollection(id);
    if (!deleted) {
      set.status = 404;
      return "合集不存在";
    }

    set.status = 204;
  })
  .get("/timeline-items/:id/collections", async ({ params: { id }, set }) => {
    if (!isUuid(id)) {
      set.status = 400;
      return "时间线 ID 参数无效";
    }

    const collectionIds = await getItemCollectionIds(id);
    if (collectionIds === null) {
      set.status = 404;
      return "条目不存在";
    }
    return { collectionIds } satisfies ItemCollectionsDto;
  })
  .patch(
    "/timeline-items/:id/collections",
    async ({ params: { id }, body, set }) => {
      const input = itemCollectionsSchema.safeParse(body);
      if (!isUuid(id) || !input.success) {
        set.status = 400;
        return "条目 ID 或合集归属无效";
      }

      const result = await saveItemCollectionIds(id, input.data.collectionIds);
      if (result === "missing-item") {
        set.status = 404;
        return "条目不存在";
      }
      if (result === "invalid-collection") {
        set.status = 400;
        return "所选合集不存在";
      }

      set.status = 204;
    },
  )
  .get(
    "/timeline-services",
    async ({ query, cookie: { [COOKIE_TOKEN_KEY]: cookieToken }, set }) => {
      const { view } = query;
      if (!isTimelineView(view)) {
        set.status = 400;
        return "时间线视角参数无效";
      }
      const ids = await getTimelineServiceIds({
        where: getTimelineWhere(
          { view },
          Boolean(IS_ADMIN_ENABLED && cookieToken.value),
        ),
      });
      return getTimelineServiceLabels(ids);
    },
  )
  .get(
    "/timeline-items",
    async ({ query, cookie: { [COOKIE_TOKEN_KEY]: cookieToken }, set }) => {
      const {
        id,
        collectionId,
        page = "0",
        limit = "20",
        orderBy = "created_at",
        serviceLabel,
        serviceType,
        search,
        view,
      } = query as GetTimelineItemsParams;

      if (id !== undefined && !isUuid(id)) {
        set.status = 400;
        return "时间线 ID 参数无效";
      }
      if (collectionId !== undefined && !isCollectionFilterId(collectionId)) {
        set.status = 400;
        return "合集 ID 参数无效";
      }
      if (!isTimelineServiceLabel(serviceLabel)) {
        set.status = 400;
        return "时间线来源标签参数无效";
      }

      if (!isTimelineView(view)) {
        set.status = 400;
        return "时间线视角参数无效";
      }

      const take = Number(limit);
      const skip = Number(page) * take;
      if (
        typeof page !== "string" ||
        typeof limit !== "string" ||
        !/^\d+$/.test(page) ||
        !/^\d+$/.test(limit) ||
        take < 1 ||
        take > 100 ||
        !Number.isSafeInteger(skip)
      ) {
        set.status = 400;
        return "时间线分页参数无效";
      }

      const where = getTimelineWhere(
        { id, serviceLabel, serviceType, search, view },
        Boolean(IS_ADMIN_ENABLED && cookieToken.value),
      );

      const timelineItems = await getTimelineItems(
        {
          take,
          skip,
          where,
          order:
            orderBy === "updated_at"
              ? { updated_at: "DESC", id: "DESC" }
              : { created_at: "DESC", id: "DESC" },
        },
        id === undefined ? collectionId : undefined,
      );
      const labelsByItem = await getTimelineCollectionLabels(
        timelineItems.map(({ id }) => id).filter((id) => id !== undefined),
      );
      return timelineItems.map((item) =>
        serializeTimelineItem(
          item,
          getTimelineServiceLabel(item.sync_service_id),
          item.id ? labelsByItem.get(item.id) : undefined,
        ),
      );
    },
  )
  .get(
    "/timeline-items/count",
    async ({ query, cookie: { [COOKIE_TOKEN_KEY]: cookieToken }, set }) => {
      const { id, collectionId, serviceLabel, serviceType, search, view } =
        query as CountTimelineItemsParams;
      if (id !== undefined && !isUuid(id)) {
        set.status = 400;
        return "时间线 ID 参数无效";
      }
      if (collectionId !== undefined && !isCollectionFilterId(collectionId)) {
        set.status = 400;
        return "合集 ID 参数无效";
      }
      if (!isTimelineServiceLabel(serviceLabel)) {
        set.status = 400;
        return "时间线来源标签参数无效";
      }
      if (!isTimelineView(view)) {
        set.status = 400;
        return "时间线视角参数无效";
      }
      const where = getTimelineWhere(
        { id, serviceLabel, serviceType, search, view },
        Boolean(IS_ADMIN_ENABLED && cookieToken.value),
      );
      return countTimelineItems(
        { where },
        id === undefined ? collectionId : undefined,
      );
    },
  )
  .post("/timeline-items/batch", async ({ body, set }) => {
    const input = batchTimelineItemsSchema.safeParse(body);
    if (!input.success) {
      set.status = 400;
      return "批量操作或所选条目无效";
    }

    const result = await applyTimelineItemBatch(input.data);
    if (result === "missing-item") {
      set.status = 404;
      return "部分所选条目已不可用，请退出多选后重试";
    }
    if (result === "invalid-collection") {
      set.status = 400;
      return "所选合集不存在";
    }

    set.status = 204;
  })
  .patch("/timeline-items/:id", async ({ params, body }) => {
    const { id } = params;
    const { is_secret } = body as UpdateTimelineItemParams;
    return await updateTimelineItem(id, {
      is_secret,
    });
  })
  .delete("/timeline-items/:id", async ({ params }) => {
    return await softDeleteTimelineItem(params.id);
  })
  .post("/timeline-items/:id/restore", async ({ params }) => {
    return await restoreSoftDeletedTimelineItem(params.id);
  })
  //#endregion
  //#region 系统管理员用户登录、登出
  .get("/login", async ({ cookie: { [COOKIE_TOKEN_KEY]: cookieToken } }) => {
    // 未启用管理员功能时，或登录态 Cookie 未通过校验时，cookieToken.value 均为空
    return {
      isLoggedIn: Boolean(IS_ADMIN_ENABLED && cookieToken.value),
    } satisfies LoginStatus;
  })
  .post(
    "/login",
    async ({ body, cookie: { [COOKIE_TOKEN_KEY]: cookieToken }, set }) => {
      const { username, password } = body as LoginParams;
      const currentAccount = ADMIN_ACCOUNTS.find(
        (item) => item.username === username && item.password === password,
      );
      if (!currentAccount) {
        set.status = 400;
        return "用户名或密码错误";
      } else {
        const token = jwt.sign({ username });
        cookieToken.set({
          ...COOKIE_OPTIONS,
          value: token,
          maxAge: 60 * 60 * 24 * 365,
        });
        return "您已登录";
      }
    },
  )
  .post("/logout", async ({ cookie: { [COOKIE_TOKEN_KEY]: cookieToken } }) => {
    clearCookieToken(cookieToken);
    return "您已登出";
  })
  //#endregion
  //#region QQ 空间扫码登录
  .get("/qzone-login", async ({ query, set }) => {
    const { qqNumber } = query;
    if (!qqNumber) {
      set.status = 400;
      return "请求参数错误";
    }

    const currentService = config.services.find(
      (service) =>
        service.type === SyncServiceType.QZONE_TALK &&
        service.qqNumber === qqNumber,
    );
    if (!currentService) {
      set.status = 400;
      return "未配置 QQ 空间说说同步服务或请求参数错误";
    }

    const qrsig = await generateQZoneLoginQRCode(qqNumber);
    if (!qrsig) {
      set.status = 500;
      return "服务端生成登录二维码异常";
    }

    pollGetQZoneLoginQRCodeScanResult(qqNumber, qrsig);

    const qrCodeImage = fs.readFileSync(getQZoneQRCodeFilePath(qqNumber));
    set.headers["content-type"] = "image/png";
    return qrCodeImage;
  })
  //#endregion
  //#region 设置服务端配置
  .get("/set", async ({ query, set }) => {
    const { bilibiliSessdata } = query;

    if (bilibiliSessdata) {
      try {
        saveBilibiliSessionData(bilibiliSessdata);
      } catch (error) {
        logger.error(`Save Bilibili SESSDATA failed:\n${formatError(error)}`);

        set.status = 500;
        return "服务端更新 Bilibili SESSDATA 失败";
      }
    }

    return "更新服务端配置成功";
  })
  //#endregion
  .onStart(async ({ server }) => {
    // 在异步初始化之前绑定，确保启动失败时可以先停止 HTTP 接入
    stopHttpServer = async () => {
      await server?.stop();
    };

    logger.info(
      `Timeline server is listening at ${server?.url ?? `127.0.0.1:${server?.port}`}.`,
    );

    // `onStart` 的异步异常不会进入 `onError`，必须以 try/catch 兜住，
    // 否则启动失败时只有原始堆栈，无法判断是哪个初始化步骤出错
    try {
      checkupDir(SERVER_TEMPORARY_DIR);
      checkupDir(SERVER_STATIC_DIR);

      await initializeDatabase();
      syncCoordinator.ready();
      if (syncCoordinator.snapshot().reason === "stopping") return;

      if (IS_FULL_SYNC_ON_START) {
        logger.info(
          "`FULL_SYNC` is enabled: performing a full sync of all data before scheduling incremental sync tasks.",
        );
        syncCoordinator.start("startup", { forceFull: true });
        await syncCoordinator.wait();
        if (syncCoordinator.snapshot().reason === "stopping") return;
      }

      const servicesByInterval = Map.groupBy(
        config.services.filter((service) => service.enabled !== false),
        (service) => service.syncInterval ?? SYNC_INTERVAL,
      );
      const jobs = new Map<schedule.Job, typeof config.services>();
      let lastScheduledAt: number | undefined;
      for (const [interval, services] of servicesByInterval) {
        const job = schedule.scheduleJob(interval, (fireDate) => {
          const scheduledAt = fireDate.getTime();
          if (lastScheduledAt === scheduledAt) return;
          lastScheduledAt = scheduledAt;

          // Include other Cron jobs due at the same time in this run.
          const dueServices = [...services];
          for (const [otherJob, otherServices] of jobs) {
            if (
              otherJob !== job &&
              otherJob.nextInvocation()?.getTime() === scheduledAt
            ) {
              dueServices.push(...otherServices);
            }
          }
          const result = syncCoordinator.start("scheduled", {
            services: dueServices,
          });
          if ("reason" in result)
            logger.warn(`Scheduled sync skipped: ${result.reason}.`);
        });
        // node-schedule also accepts dates and empty strings as schedules.
        if (
          !job ||
          !interval.trim() ||
          ("isOneTimeJob" in job && job.isOneTimeJob === true)
        ) {
          job?.cancel();
          throw new Error(
            `Invalid \`syncInterval\` cron expression: \`${interval}\` for ${services.map(({ id }) => id).join(", ")}.`,
          );
        }
        jobs.set(job, services);
        logger.info(`Sync tasks are scheduled with \`${interval}\`.`);
      }

      if (!IS_FULL_SYNC_ON_START) {
        if (IS_DEVELOPMENT) {
          logger.info(
            "Development mode is active: skipping initial startup sync.",
          );
        } else {
          syncCoordinator.start("startup");
        }
      }
    } catch (error) {
      // `exitWithError` 内部会终止进程，不会继续执行后续语句
      await exitWithError("Timeline server failed to start", error);
    }

    logger.success("Timeline server started successfully.");
  })
  .onStop(async () => {
    // Elysia 不会等待 `onStop` 返回的 promise（Bun adapter 直接调用 fn 而不 await），
    // 因此这里只做幂等的资源释放；需要"等清理完成再退出"的调用方必须自行 await `teardown`
    await teardown("normal shutdown");
  });

if (import.meta.main) {
  app.listen(PORT);
  process.on("uncaughtException", (error) => {
    void exitWithError("Uncaught exception", error);
  });

  process.on("unhandledRejection", (reason) => {
    void exitWithError("Unhandled promise rejection", reason);
  });

  // 容器与 Ctrl+C 触发的是信号，不会自动走 `onStop`。这里直接 await `teardown`：
  // 必须等到 `destroyDatabase()` 完成后才退出，否则正在写入的同步数据可能被截断
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      logger.info(`Received ${signal}, shutting down...`);
      void (async () => {
        try {
          await stopHttpServer();
          await teardown(signal);
        } catch (error) {
          logger.error(`Graceful shutdown failed:\n${formatError(error)}`);
        } finally {
          await flushStdio();
          // 保留失败路径已设置的退出码，否则崩溃会被当成正常关闭
          process.exit(process.exitCode ?? 0);
        }
      })();
    });
  }
}
