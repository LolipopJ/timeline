import { fileURLToPath } from "node:url";

import { readClientConfig } from "./config.mjs";

process.env.NEXT_PUBLIC_TIMELINE_CONFIG = JSON.stringify(readClientConfig());

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  transpilePackages: ["@timeline/contracts"],
  turbopack: {
    root: fileURLToPath(new URL("..", import.meta.url)),
  },
};

export default nextConfig;
