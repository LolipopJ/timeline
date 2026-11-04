import type {
  SyncAcceptedDto,
  SyncRejectedDto,
  SyncRunDto,
  SyncStatusDto,
  SyncTrigger,
  SyncUnavailableReason,
} from "@timeline/contracts";

import type { SyncService } from "../types/config";
import { createLogger, formatError } from "../utils/logger";
import { truncateLogMessage } from "../utils/runtime-logs";

const logger = createLogger("Sync");

export const createSyncCoordinator = (
  getServices: () => readonly SyncService[],
  execute: (service: SyncService) => Promise<unknown>,
) => {
  let phase: "initializing" | "ready" | "stopping" = "initializing";
  let current: SyncRunDto | null = null;
  let last: SyncRunDto | null = null;
  let inFlight: Promise<void> | null = null;

  const unavailableReason = (): SyncUnavailableReason | null => {
    if (phase !== "ready") return phase;
    if (current) return "busy";
    if (!getServices().some((service) => service.enabled !== false))
      return "no_services";
    return null;
  };

  return {
    ready() {
      if (phase === "initializing") phase = "ready";
    },
    stop() {
      phase = "stopping";
    },
    snapshot(): SyncStatusDto {
      const reason = unavailableReason();
      return structuredClone({
        available: reason === null,
        reason,
        current,
        last,
      });
    },
    wait() {
      return inFlight ?? Promise.resolve();
    },
    start(
      trigger: SyncTrigger,
      forceFull = false,
    ): SyncAcceptedDto | SyncRejectedDto {
      const reason = unavailableReason();
      if (reason)
        return {
          reason,
          ...(reason === "busy" && current ? { runId: current.id } : {}),
        };

      const services = getServices().filter(
        (service) => service.enabled !== false,
      );
      const run: SyncRunDto = {
        id: crypto.randomUUID(),
        trigger,
        startedAt: new Date().toISOString(),
        finishedAt: null,
        status: "running",
        services: services.map(({ id, type, label }) => ({
          id,
          type,
          label,
          status: "running",
        })),
      };
      // Reserve before any service I/O so every trigger sees the same current run.
      current = run;
      inFlight = Promise.resolve()
        .then(async () => {
          logger.info(
            `Start ${trigger} sync ${run.id}${forceFull ? " (full)" : ""}.`,
          );
          const results = await Promise.allSettled(
            services.map(async (service, index) => {
              const result = run.services[index];
              try {
                await execute(forceFull ? { ...service, full: true } : service);
                result.status = "succeeded";
              } catch (error) {
                result.status = "failed";
                result.error = truncateLogMessage(formatError(error));
                logger.error(
                  `Sync task ${service.id} (${service.type}) failed:\n${result.error}`,
                );
                throw error;
              }
            }),
          );
          const failures = results.filter(
            (result) => result.status === "rejected",
          ).length;
          run.status =
            failures === 0
              ? "succeeded"
              : failures === services.length
                ? "failed"
                : "partial";
          if (failures)
            logger.error(
              `Sync ${run.id} completed with ${failures} failure(s).`,
            );
          else logger.success(`Sync ${run.id} completed.`);
        })
        .catch((error: unknown) => {
          run.status = "failed";
          run.error = truncateLogMessage(formatError(error));
          for (const result of run.services) {
            if (result.status === "running") {
              result.status = "failed";
              result.error = run.error;
            }
          }
          logger.error(`Sync coordinator failed:\n${run.error}`);
        })
        .finally(() => {
          run.finishedAt = new Date().toISOString();
          last = run;
          current = null;
          inFlight = null;
        });
      return { runId: run.id };
    },
  };
};
