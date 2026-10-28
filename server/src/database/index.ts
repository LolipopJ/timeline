import { DataSource } from "typeorm";

import config from "../../configs/server";
import { createLogger, formatError } from "../utils/logger";
import TimelineItem from "./entity/timeline-item";

const logger = createLogger("Database");

export const DATABASE_NAME =
  config.database.database +
  (process.env.NODE_ENV === "development" ? "_dev" : "");

/** 用于日志输出的数据库地址，不包含密码 */
export const DATABASE_TARGET = `${config.database.user}@${config.database.host}:${config.database.port}/${DATABASE_NAME}`;

/** 建立连接的最长等待时间，避免网络不可达时连接一直挂起且没有任何日志 */
const CONNECT_TIMEOUT_MS = 10_000;

/** 将数据库驱动的错误码转换为可直接行动的排查提示 */
const getDatabaseErrorHint = (error: unknown) => {
  // `connectTimeoutMS` 触发的超时错误由 pg 直接构造，不携带错误码
  if (/timeout expired/i.test(String((error as Error | null)?.message))) {
    return `连接超时（${CONNECT_TIMEOUT_MS}ms）：请检查网络连通性、防火墙规则，或适当调大 \`connectTimeoutMS\`。`;
  }

  switch ((error as { code?: unknown } | null)?.code) {
    case "ECONNREFUSED":
      return "连接被拒绝：请确认 PostgreSQL 已启动，且 `host`、`port` 配置正确。";
    case "ENOTFOUND":
    case "EAI_AGAIN":
      return "无法解析主机名：请检查 `host` 配置或 DNS 解析。";
    case "ETIMEDOUT":
    case "EHOSTUNREACH":
    case "ENETUNREACH":
      return "连接超时或网络不可达：请检查网络、防火墙与 `host` 配置。";
    case "28P01":
    case "28000":
      return "身份验证失败：请检查 `user`、`password` 配置，以及该用户是否允许从当前主机连接。";
    case "3D000":
      return `数据库不存在：请先创建数据库 \`${DATABASE_NAME}\`（参见 README 中的 \`CREATE DATABASE\` 说明）。`;
    case "42501":
      return "权限不足：请确认连接用户拥有该数据库的读写权限。";
    case "57P03":
      return "数据库正在启动或拒绝新连接：请稍后重试。";
    case undefined:
      // 没有错误码时通常是对端中途断开连接，常见于需要 SSL 的云数据库
      return "无法建立连接：请确认目标地址可从当前网络访问、数据库未要求 SSL 连接，并检查数据库日志。";
    default:
      return `数据库返回错误 ${String((error as { code?: unknown }).code)}：请在数据库日志中确认失败原因。`;
  }
};

export const AppDataSource = new DataSource({
  type: "postgres",
  host: config.database.host,
  port: config.database.port,
  username: config.database.user,
  password: config.database.password,
  database: DATABASE_NAME,
  entities: [TimelineItem],
  synchronize: true,
  invalidWhereValuesBehavior: {
    undefined: "ignore",
  },
  logging: false,
  connectTimeoutMS: CONNECT_TIMEOUT_MS,
  // 空闲连接上的异常不会抛到业务代码，不显式处理会被 TypeORM 的默认实现吞掉
  poolErrorHandler: (error: unknown) => {
    logger.error(
      `PostgreSQL connection pool raised an error (\`${DATABASE_TARGET}\`):\n${formatError(error)}`,
    );
  },
});

export const initializeDatabase = async () => {
  if (AppDataSource.isInitialized) return;

  logger.info(`Connecting to PostgreSQL at \`${DATABASE_TARGET}\`...`);

  try {
    await AppDataSource.initialize();
  } catch (error) {
    // 交给调用方统一记录一次完整异常，避免同一份堆栈被重复打印
    throw new Error(
      [
        `Failed to connect to PostgreSQL at \`${DATABASE_TARGET}\`.`,
        getDatabaseErrorHint(error),
        "请检查 `server/configs/server.ts` 中的 `database` 配置与数据库运行状态。",
      ]
        .filter(Boolean)
        .join("\n"),
      { cause: error },
    );
  }

  logger.success(`Database connection initialized (\`${DATABASE_TARGET}\`).`);
};

export const destroyDatabase = async () => {
  if (!AppDataSource.isInitialized) {
    logger.warn("Database connection is not initialized, skip destroying.");
    return;
  }

  try {
    await AppDataSource.destroy();
  } catch (error) {
    logger.error(
      `Failed to destroy database connection (\`${DATABASE_TARGET}\`):\n${formatError(error)}`,
    );
    return;
  }

  logger.info("Database connection destroyed.");
};

export default AppDataSource;
