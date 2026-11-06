import type { readClientConfig } from "../config.mjs";

const serializedConfig = process.env.NEXT_PUBLIC_TIMELINE_CONFIG;
if (serializedConfig === undefined) {
  throw new Error("缺少客户端构建配置。");
}

const config: ReturnType<typeof readClientConfig> =
  JSON.parse(serializedConfig);

export default config;
