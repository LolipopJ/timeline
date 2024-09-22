import "reflect-metadata";

import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import schedule from "node-schedule";
import { ILike } from "typeorm";

import config from "../../configs/server";
import type { SyncServiceType } from "../../enums";
import type {
  CountTimelineItemsParams,
  GetTimelineItemsParams,
  TimelineItemClient,
} from "../../interfaces/api";
import type { LoginAccount } from "../../interfaces/server";
import database from "./database";
import {
  countTimelineItems,
  getTimelineItems,
} from "./database/controller/timeline-item";
import sync from "./sync";
import { JWT } from "./utils/jwt";

const PORT = Number(config.listeningPort ?? 4000);

const ALLOWED_ORIGIN = config.allowedOrigin ?? true;

const SERVICE_LABEL_MAP = new Map(
  config.services.map((service) => [service.id, service.label]),
);

const SYNC_INTERVAL = config.syncInterval ?? "*/30 * * * *";

const JWT_SECRET_KEY = config.admin?.secretKey;
const ADMIN_ACCOUNTS = config.admin?.accounts ?? [];
const COOKIE_TOKEN_KEY = "access-token";
const jwt = new JWT(JWT_SECRET_KEY ?? "won't used");

new Elysia()
  .use(
    cors({
      origin: ALLOWED_ORIGIN,
    }),
  )
  .onBeforeHandle(
    ({ path, cookie: { [COOKIE_TOKEN_KEY]: cookieToken }, set }) => {
      if (!JWT_SECRET_KEY) {
        if (["/login", "/logout"].includes(path)) {
          set.status = 405;
          return "管理员功能未启用";
        }
      } else {
        if (cookieToken.value) {
          try {
            jwt.verify(cookieToken.value);
          } catch (err: unknown) {
            console.error(
              `请求包含不合法的用户 Token：${cookieToken.value}\n${String(err)}`,
            );
            cookieToken.remove();
          }
        }
      }
    },
  )
  .get(
    "/timeline-items",
    async ({ query, cookie: { [COOKIE_TOKEN_KEY]: cookieToken } }) => {
      const {
        page = "0",
        limit = "20",
        serviceId,
        serviceType,
        search,
      } = query as GetTimelineItemsParams;

      const take = Number(limit);
      if (take > 100) return [];

      const skip = Number(page) * take;

      const baseOptionWhere = {
        sync_service_id: serviceId,
        sync_service_type: serviceType as SyncServiceType,
        is_secret: cookieToken.value ? undefined : false,
      };
      const where = search
        ? [
            {
              ...baseOptionWhere,
              title: ILike(`%${search}%`),
            },
            {
              ...baseOptionWhere,
              content: ILike(`%${search}%`),
            },
          ]
        : baseOptionWhere;

      const timelineItems = await getTimelineItems({
        take,
        skip,
        where,
      });

      const resolvedTimelineItems: TimelineItemClient[] = timelineItems.map(
        (item) => ({
          id: item.id,
          label: SERVICE_LABEL_MAP.get(item.sync_service_id),
          sync_service_type: item.sync_service_type,
          title: item.title,
          content: item.content,
          url: item.url,
          attachments: item.attachments,
          version: item.version,
          created_at: item.created_at,
          updated_at: item.updated_at,
        }),
      );

      return resolvedTimelineItems;
    },
  )
  .get(
    "/timeline-items/count",
    async ({ query, cookie: { [COOKIE_TOKEN_KEY]: cookieToken } }) => {
      const { serviceId, serviceType, search } =
        query as CountTimelineItemsParams;
      const baseOptionWhere = {
        sync_service_id: serviceId,
        sync_service_type: serviceType as SyncServiceType,
        is_secret: cookieToken.value ? undefined : false,
      };
      const where = search
        ? [
            {
              ...baseOptionWhere,
              title: ILike(`%${search}%`),
            },
            {
              ...baseOptionWhere,
              content: ILike(`%${search}%`),
            },
          ]
        : baseOptionWhere;
      const timelineItemsCount = await countTimelineItems({ where });
      return timelineItemsCount;
    },
  )
  .post(
    "/login",
    async ({ body, cookie: { [COOKIE_TOKEN_KEY]: cookieToken }, set }) => {
      const { username, password } = body as LoginAccount;
      const currentAccount = ADMIN_ACCOUNTS.find(
        (item) => item.username === username && item.password === password,
      );
      if (!currentAccount) {
        set.status = 400;
        return "用户名或密码错误";
      } else {
        const token = jwt.sign({ username });
        cookieToken.value = token;
        cookieToken.set({ httpOnly: true, sameSite: "strict" });
        return "您已登录";
      }
    },
  )
  .post("/logout", async ({ cookie: { [COOKIE_TOKEN_KEY]: cookieToken } }) => {
    cookieToken.remove();
    return "您已登出";
  })
  .onStart(async ({ server }) => {
    console.log(
      `Timeline server is running at ${server?.url ?? `127.0.0.1:${server?.port}`}`,
    );

    await database.initialize();
    console.log("Database connection initialized.");

    const syncJob = schedule.scheduleJob(SYNC_INTERVAL, sync);
    syncJob.invoke();
  })
  .onStop(async () => {
    await schedule.gracefulShutdown();
    console.log("Scheduled tasks cancelled.");

    await database.destroy();
    console.log("Database connection destroyed.");

    process.exit(0);
  })
  .listen(PORT);
