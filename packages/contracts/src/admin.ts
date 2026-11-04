import type { SyncServiceType } from "./enums";

export type SyncTrigger = "manual" | "scheduled" | "startup";
export type SyncRunStatus = "running" | "succeeded" | "partial" | "failed";
export type SyncUnavailableReason =
  "initializing" | "stopping" | "busy" | "no_services";

export interface SyncServiceResultDto {
  id: string;
  type: SyncServiceType;
  label?: string;
  status: "running" | "succeeded" | "failed";
  error?: string;
}

export interface SyncRunDto {
  id: string;
  trigger: SyncTrigger;
  startedAt: string;
  finishedAt: string | null;
  status: SyncRunStatus;
  services: SyncServiceResultDto[];
  error?: string;
}

export interface SyncStatusDto {
  available: boolean;
  reason: SyncUnavailableReason | null;
  current: SyncRunDto | null;
  last: SyncRunDto | null;
}

export interface SyncAcceptedDto {
  runId: string;
}

export interface SyncRejectedDto {
  reason: SyncUnavailableReason;
  runId?: string;
}

export type RuntimeLogLevel = "info" | "success" | "warn" | "error";

export interface RuntimeLogRecordDto {
  id: number;
  timestamp: string;
  level: RuntimeLogLevel;
  module: string;
  message: string;
}

export interface RuntimeLogFilters {
  level?: RuntimeLogLevel;
  module?: string;
  q?: string;
  limit?: number;
}

export interface RuntimeLogsDto {
  records: RuntimeLogRecordDto[];
}
