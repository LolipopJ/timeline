import type {
  RuntimeLogLevel,
  StartSyncParams,
  SyncRejectedDto,
} from "@timeline/contracts";

import config from "./config";
import { syncCoordinator } from "./sync";
import { runtimeLogs } from "./utils/runtime-logs";

export const getAdminSyncStatus = (serviceId?: string) =>
  syncCoordinator.snapshot(serviceId);

export const requestAdminSync = ({ serviceIds }: StartSyncParams) => {
  const selectedIds = new Set(serviceIds);
  const services = config.services.filter(({ id }) => selectedIds.has(id));
  if (services.length !== selectedIds.size) {
    return {
      status: 400,
      body: { reason: "invalid_selection" } satisfies SyncRejectedDto,
    };
  }
  const body = syncCoordinator.start("manual", { services });
  return {
    status:
      "reason" in body
        ? body.reason === "initializing" || body.reason === "stopping"
          ? 503
          : 409
        : 202,
    body,
  };
};

const isLogLevel = (level: string): level is RuntimeLogLevel =>
  ["info", "success", "warn", "error"].includes(level);

export const getAdminLogs = (query: Record<string, string | undefined>) => {
  const { level, module, q, limit } = query;
  if (
    (level !== undefined && !isLogLevel(level)) ||
    (limit !== undefined &&
      (!/^\d+$/.test(limit) || Number(limit) < 1 || Number(limit) > 200))
  ) {
    return {
      status: 400,
      body: { message: "日志筛选参数无效，limit 须为 1–200 的整数。" },
    };
  }
  return {
    status: 200,
    body: runtimeLogs.read({
      level,
      module,
      q,
      limit: limit === undefined ? undefined : Number(limit),
    }),
  };
};
