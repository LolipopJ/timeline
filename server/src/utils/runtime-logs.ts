import type {
  RuntimeLogFilters,
  RuntimeLogLevel,
  RuntimeLogRecordDto,
  RuntimeLogsDto,
} from "@timeline/contracts";

const CAPACITY = 500;
const MESSAGE_LIMIT = 4096;
const TRUNCATED = "… [已截断]";

export const truncateLogMessage = (message: string) =>
  message.length > MESSAGE_LIMIT
    ? message.slice(0, MESSAGE_LIMIT - TRUNCATED.length) + TRUNCATED
    : message;

export const createRuntimeLogBuffer = () => {
  const records: RuntimeLogRecordDto[] = [];
  let id = 0;
  return {
    append(
      level: RuntimeLogLevel,
      module: string,
      message: string,
    ): RuntimeLogRecordDto {
      const record = {
        id: ++id,
        timestamp: new Date().toISOString(),
        level,
        module,
        message: truncateLogMessage(message),
      };
      records.push(record);
      if (records.length > CAPACITY) records.shift();
      return { ...record };
    },
    read({
      level,
      module,
      q,
      limit = 100,
    }: RuntimeLogFilters = {}): RuntimeLogsDto {
      const keyword = q?.toLowerCase();
      return {
        records: records
          .filter(
            (record) =>
              (!level || record.level === level) &&
              (module === undefined || record.module === module) &&
              (!keyword || record.message.toLowerCase().includes(keyword)),
          )
          .sort((a, b) => b.timestamp.localeCompare(a.timestamp) || b.id - a.id)
          .slice(0, limit)
          .map((record) => ({ ...record })),
      };
    },
  };
};

export const runtimeLogs = createRuntimeLogBuffer();
