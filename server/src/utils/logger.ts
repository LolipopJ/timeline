const LEVEL_EMOJI = {
  info: "⚪",
  success: "✅️",
  warn: "⚠️",
  error: "❌",
} as const;

type LogLevel = keyof typeof LEVEL_EMOJI;

/** 直接打印 `Error` 只会输出 `Error: <message>`，统一展开为带堆栈的文本 */
const normalizeArgs = (args: unknown[]) =>
  args.map((arg) => (arg instanceof Error ? formatError(arg) : arg));

const print = (
  method: "log" | "warn" | "error",
  module: string,
  level: LogLevel,
  message: string,
  args: unknown[],
) => {
  console[method](
    `${LEVEL_EMOJI[level]} [${module}] ${message}`,
    ...normalizeArgs(args),
  );
};

export interface Logger {
  /** 记录任务进度等一般信息 */
  info: (message: string, ...args: unknown[]) => void;
  /** 记录任务执行成功的结果 */
  success: (message: string, ...args: unknown[]) => void;
  /** 记录可恢复的异常情况 */
  warn: (message: string, ...args: unknown[]) => void;
  /** 记录任务执行失败的结果 */
  error: (message: string, ...args: unknown[]) => void;
}

/** 创建带有模块前缀与结果 emoji 的日志输出器 */
export const createLogger = (module: string): Logger => ({
  info: (message, ...args) => print("log", module, "info", message, args),
  success: (message, ...args) => print("log", module, "success", message, args),
  warn: (message, ...args) => print("warn", module, "warn", message, args),
  error: (message, ...args) => print("error", module, "error", message, args),
});

/**
 * 异常常带有的可诊断字段。PostgreSQL 驱动的异常不会把错误码、连接地址等信息
 * 放进 `message`，不单独提取就只剩 `Error: connect ECONNREFUSED` 这类无上下文信息。
 */
const DIAGNOSTIC_STRING_FIELDS = [
  "code",
  "syscall",
  "address",
  "hostname",
  "severity",
  "detail",
  "hint",
  "schema",
  "table",
  "column",
  "constraint",
  "routine",
] as const;

const DIAGNOSTIC_NUMBER_FIELDS = ["errno", "port"] as const;

const MAX_CAUSE_DEPTH = 5;

const formatNonError = (error: unknown) => {
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error) ?? String(error);
  } catch {
    return String(error);
  }
};

interface HttpErrorLike {
  config?: { url?: unknown; method?: unknown };
  response?: { status?: unknown };
}

/**
 * 去掉查询串与片段。部分接口把凭据直接拼在 URL 上（如 `ptqrlogin?...&ptsigx=...`），
 * 原样记录会把有效的登录票据写进日志。
 */
export const stripQuery = (url: string) => url.split(/[?#]/)[0];

/** Axios 异常的 `message` 不含请求地址，补上才能定位是哪个接口失败 */
const getHttpErrorDetails = (error: unknown) => {
  const { config, response } = (error ?? {}) as HttpErrorLike;
  return [
    typeof config?.method === "string"
      ? `method=${config.method.toUpperCase()}`
      : undefined,
    typeof config?.url === "string"
      ? `url=${stripQuery(config.url)}`
      : undefined,
    response?.status === undefined ? undefined : `status=${response.status}`,
  ].filter((item) => item !== undefined);
};

/**
 * 将任意异常格式化为包含堆栈、诊断字段与 `cause` 链的多行文本。
 * 直接使用 `${error}` 只会得到 `Error: <message>`，会丢失定位问题所需的堆栈。
 */
export const formatError = (error: unknown, depth = 0): string => {
  if (!(error instanceof Error)) return formatNonError(error);

  const parts = [error.stack ?? `${error.name}: ${error.message}`];
  const diagnostics = [
    ...DIAGNOSTIC_STRING_FIELDS.map((field) => {
      const value = (error as Error & Partial<Record<string, unknown>>)[field];
      return typeof value === "string" ? `${field}=${value}` : undefined;
    }),
    ...DIAGNOSTIC_NUMBER_FIELDS.map((field) => {
      const value = (error as Error & Partial<Record<string, unknown>>)[field];
      return typeof value === "number" ? `${field}=${value}` : undefined;
    }),
    ...getHttpErrorDetails(error),
  ].filter((item) => item !== undefined);
  if (diagnostics.length > 0) parts.push(`  ${diagnostics.join(", ")}`);

  if (depth < MAX_CAUSE_DEPTH) {
    const cause = (error as Error & { cause?: unknown }).cause;
    if (cause !== undefined) {
      parts.push(`Caused by: ${formatError(cause, depth + 1)}`);
    }
    if (error instanceof AggregateError && error.errors.length > 0) {
      parts.push(
        `Aggregated errors:\n${error.errors
          .map((item) => formatError(item, depth + 1))
          .join("\n")}`,
      );
    }
  }

  return parts.join("\n");
};

/**
 * 已知可安全记录的查询参数键名（统一小写比较）。
 * 采用允许列表：不认识的参数一律脱敏，避免新增接口把凭据写进日志。
 * `search` 是用户输入的查询词而非凭据，保留取值以便定位问题。
 */
const SAFE_QUERY_KEYS = new Set([
  "page",
  "limit",
  "orderby",
  "search",
  "serviceid",
  "servicetype",
]);

const REDACTED = "***";

/**
 * 生成可安全写入日志的请求地址。
 * 凭据可能出现在任意参数中（如 `/set?bilibiliSessdata=...`、
 * `/ptqrlogin?...&ptsigx=...`），因此仅保留白名单参数的取值。
 */
export const formatRequestUrl = (requestUrl: string | URL) => {
  const url = requestUrl instanceof URL ? requestUrl : new URL(requestUrl);
  const searchParams = new URLSearchParams();

  url.searchParams.forEach((value, key) => {
    searchParams.set(
      key,
      SAFE_QUERY_KEYS.has(key.toLowerCase()) ? value : REDACTED,
    );
  });

  const search = searchParams.toString();
  return `${url.pathname}${search ? `?${search}` : ""}`;
};
