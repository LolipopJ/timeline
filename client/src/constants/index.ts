import clientConfig from "../../../configs/client";

export const SERVER_STATIC_PREFIX = `${clientConfig.server?.baseURL ?? ""}/static`;

export const LS_LAST_VISIT_DATE = "last-visit-date";
