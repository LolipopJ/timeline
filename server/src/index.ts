import "reflect-metadata";

import { cors } from "@elysiajs/cors";
import { staticPlugin } from "@elysiajs/static";
import { Elysia } from "elysia";
import type { ElysiaCookie } from "elysia/cookies";
import fs from "fs";
import schedule from "node-schedule";
import { ILike } from "typeorm";

import config from "../../configs/server";
import { SyncServiceType } from "../../enums";
import type {
  CountTimelineItemsParams,
  GetTimelineItemsParams,
  TimelineItemClient,
} from "../../interfaces/api";
import type { LoginAccount } from "../../interfaces/server";
import { SERVER_STATIC_DIR, SERVER_TEMPORARY_DIR } from "./constants";
import database from "./database";
import {
  countTimelineItems,
  getTimelineItems,
} from "./database/controller/timeline-item";
import sync from "./sync";
import { saveBilibiliSessionData } from "./utils/bilibili";
import { checkupDir } from "./utils/file";
import { JWT } from "./utils/jwt";
import {
  generateQZoneLoginQRCode,
  getQZoneQRCodeFilePath,
  pollGetQZoneLoginQRCodeScanResult,
} from "./utils/qzone";

const PORT = Number(config.listeningPort ?? 4000);

const ALLOWED_ORIGIN = config.allowedOrigin ?? true;

const SERVICE_LABEL_MAP = new Map(
  config.services.map((service) => [service.id, service.label]),
);

const SYNC_INTERVAL = config.syncInterval ?? "*/30 * * * *";

const JWT_SECRET_KEY = config.admin?.secretKey;
const ADMIN_ACCOUNTS = config.admin?.accounts ?? [];
const IS_ADMIN_ENABLED = JWT_SECRET_KEY && ADMIN_ACCOUNTS.length;
const COOKIE_TOKEN_KEY = "access-token";
const jwt = new JWT(JWT_SECRET_KEY ?? "won't used");

const COOKIE_OPTIONS: Partial<ElysiaCookie> = {
  httpOnly: true,
  sameSite: "strict",
};

checkupDir(SERVER_TEMPORARY_DIR);
checkupDir(SERVER_STATIC_DIR);

new Elysia()
  .use(
    cors({
      origin: ALLOWED_ORIGIN,
      credentials: true,
    }),
  )
  .use(
    staticPlugin({
      assets: SERVER_STATIC_DIR,
      prefix: "/static",
      alwaysStatic: false,
      staticLimit: 0,
      enableDecodeURI: true,
      maxAge: 60 * 60 * 24 * 7,
    }),
  )
  .onError(({ request, error }) => {
    console.error(
      `An error occurred while resolving request \`${request.url}\`:\n\t${error}`,
    );
  })
  .onBeforeHandle(
    ({ path, cookie: { [COOKIE_TOKEN_KEY]: cookieToken }, set }) => {
      if (IS_ADMIN_ENABLED) {
        // 服务端启用了管理员功能，在正式处理请求前校验登录态
        let isCookieValidated = false;
        if (cookieToken.value) {
          try {
            // 若校验通过，后续路由可以通过 cookieToken.value 值是否为空来判断是否已登录
            jwt.verify(cookieToken.value);
            isCookieValidated = true;
          } catch (error) {
            // 校验不通过，清除 cookieToken.value
            console.error(
              `请求包含不合法的用户 Token \`${cookieToken.value}\`。`,
              String(error),
            );
            cookieToken.set(COOKIE_OPTIONS);
            cookieToken.remove();
          }
        }

        // 启用管理员功能时，如校验不通过，拦截敏感操作路由
        // 若未启用管理员功能，这些路由将正常放行
        if (!isCookieValidated) {
          if (["/qzone-login", "/set"].includes(path)) {
            set.status = 400;
            return "您未登录，或登录已过期";
          }
        }
      } else {
        // 服务端未启用管理员功能，拦截登录相关路由
        if (["/login", "/logout"].includes(path)) {
          set.status = 400;
          return "管理员功能未启用";
        }
      }
    },
  )
  //#region 时间线接口
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
        ({
          id,
          sync_service_id,
          sync_service_type,
          title,
          content,
          url,
          attachments,
          version,
          created_at,
          updated_at,
          is_secret,
        }) => ({
          id,
          label: SERVICE_LABEL_MAP.get(sync_service_id),
          sync_service_type,
          title,
          content,
          url,
          attachments,
          version,
          created_at,
          updated_at,
          is_secret,
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
  //#endregion
  //#region 系统管理员用户登录、登出
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
    cookieToken.set(COOKIE_OPTIONS);
    cookieToken.remove();
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
        console.error(`Save Bilibili SESSDATA failed: ${String(error)}`);

        set.status = 500;
        return "服务端更新 Bilibili SESSDATA 失败";
      }
    }

    return "更新服务端配置成功";
  })
  //#endregion
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
