const LEVEL_EMOJI = {
  info: "⚪",
  success: "✅️",
  warn: "⚠️",
  error: "❌",
} as const;

type LogLevel = keyof typeof LEVEL_EMOJI;

const print = (
  method: "log" | "warn" | "error",
  module: string,
  level: LogLevel,
  message: string,
  args: unknown[],
) => {
  console[method](`${LEVEL_EMOJI[level]} [${module}] ${message}`, ...args);
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
