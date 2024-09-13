import "reflect-metadata";

import { Elysia } from "elysia";
import schedule from "node-schedule";

import config from "../../config/server";
import type { SyncServiceType } from "../../enum";
import database from "./database";
import { getTimelineItems } from "./database/controller/timeline-item";
import sync from "./sync";

const PORT = Number(config.listeningPort ?? 4000);

new Elysia()
  .get("/timeline-items", async ({ query }) => {
    const { take, skip, serviceId, serviceType } = query;
    return await getTimelineItems({
      take: Number(take ?? 20),
      skip: Number(skip ?? 0),
      where: {
        sync_service_id: serviceId,
        sync_service_type: serviceType as SyncServiceType,
      },
    });
  })
  .onStart(async ({ server }) => {
    console.log(`Timeline server is running at ${server?.url}`);

    await database.initialize();
    console.info("Database connection initialized.");

    const syncJob = schedule.scheduleJob(
      config.syncInterval ?? "*/30 * * * *",
      sync,
    );
    syncJob.invoke();
  })
  .onStop(async () => {
    await schedule.gracefulShutdown();
    console.info("Scheduled tasks cancelled.");

    await database.destroy();
    console.info("Database connection destroyed.");

    process.exit(0);
  })
  .listen(PORT);
