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
import database from "./database";
import {
  countTimelineItems,
  getTimelineItems,
} from "./database/controller/timeline-item";
import sync from "./sync";

const IS_DEVELOPMENT = process.env.NODE_ENV === "development";

const PORT = Number(config.listeningPort ?? 4000);
const ALLOWED_ORIGIN = IS_DEVELOPMENT ? "*" : (config?.client?.origin ?? "*");
const SERVICE_LABEL_MAP = new Map(
  config.services.map((service) => [service.id, service.label]),
);

new Elysia()
  .use(
    cors({
      origin: ALLOWED_ORIGIN,
    }),
  )
  .get("/timeline-items", async ({ query }) => {
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
  })
  .get("/timeline-items/count", async ({ query }) => {
    const { serviceId, serviceType, search } =
      query as CountTimelineItemsParams;
    const baseOptionWhere = {
      sync_service_id: serviceId,
      sync_service_type: serviceType as SyncServiceType,
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
  })
  .onStart(async ({ server }) => {
    console.log(
      `Timeline server is running at ${server?.url ?? `127.0.0.1:${server?.port}`}`,
    );

    await database.initialize();
    console.log("Database connection initialized.");

    const syncJob = schedule.scheduleJob(
      config.syncInterval ?? "*/30 * * * *",
      sync,
    );
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
