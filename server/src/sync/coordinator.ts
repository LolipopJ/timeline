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
  execute: (service: SyncService) => Promise<number>,
) => {
  let phase: "initializing" | "ready" | "stopping" = "initializing";
  let current: SyncRunDto | null = null;
  const history: SyncRunDto[] = [];
  let inFlight: Promise<void> | null = null;

  const unavailableReason = (
    services = getServices(),
  ): SyncUnavailableReason | null => {
    if (phase !== "ready") return phase;
    if (current) return "busy";
    if (!services.some((service) => service.enabled !== false))
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
        history,
      });
    },
    wait() {
      return inFlight ?? Promise.resolve();
    },
    start(
      trigger: SyncTrigger,
      { forceFull = false, services: candidates = getServices() } = {},
    ): SyncAcceptedDto | SyncRejectedDto {
      const reason = unavailableReason(candidates);
      if (reason)
        return {
          reason,
          ...(reason === "busy" && current ? { runId: current.id } : {}),
        };

      const services = candidates.filter(
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
                const itemCount = await execute(
                  forceFull ? { ...service, full: true } : service,
                );
                run.services[index] = {
                  ...result,
                  status: "succeeded",
                  itemCount,
                };
              } catch (error) {
                const message = truncateLogMessage(formatError(error));
                run.services[index] = {
                  ...result,
                  status: "failed",
                  error: message,
                };
                logger.error(
                  `Sync task ${service.id} (${service.type}) failed:\n${message}`,
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
          const message = truncateLogMessage(formatError(error));
          run.error = message;
          run.services = run.services.map((result) =>
            result.status === "running"
              ? { ...result, status: "failed", error: message }
              : result,
          );
          logger.error(`Sync coordinator failed:\n${message}`);
        })
        .finally(() => {
          run.finishedAt = new Date().toISOString();
          history.unshift(run);
          if (history.length > 10) history.pop();
          current = null;
          inFlight = null;
        });
      return { runId: run.id };
    },
  };
};
