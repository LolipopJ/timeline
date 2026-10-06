import js from "@eslint/js";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import { defineConfig, globalIgnores } from "eslint/config";
import prettierRecommended from "eslint-plugin-prettier/recommended";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Server-only development installs do not include the Next parser or CSS toolchain.
const clientInstalled = existsSync(
  new URL("./client/node_modules/next/package.json", import.meta.url),
);
const nextVitals = clientInstalled
  ? (await import("eslint-config-next/core-web-vitals")).default
  : [];
const nextTypescript = clientInstalled
  ? (await import("eslint-config-next/typescript")).default
  : [];
const tailwindcss = clientInstalled
  ? (await import("eslint-plugin-tailwindcss")).default
  : undefined;

const clientFiles = ["client/**/*.{js,jsx,mjs,ts,tsx}"];
const sharedFiles = [
  "server/**/*.ts",
  "packages/contracts/**/*.ts",
  "scripts/**/*.{ts,mjs}",
];

// Intersect each preset's own file patterns with the application boundary.
// Generated files are ignored globally below, instead of inside presets.
const scope = (configs, files) =>
  (Array.isArray(configs) ? configs : [configs])
    .filter((config) => !config.ignores)
    .map((config) => ({
      ...config,
      files: config.files
        ? files.flatMap((file) =>
            config.files.map((pattern) => [
              file,
              ...(Array.isArray(pattern) ? pattern : [pattern]),
            ]),
          )
        : files,
    }));

export default defineConfig([
  globalIgnores([
    "**/node_modules/**",
    "**/.pnp/**",
    ".pnp.js",
    ".yarn/install-state.gz",
    "**/coverage/**",
    "**/.next/**",
    "**/out/**",
    "**/build/**",
    "**/.DS_Store/**",
    "**/*.pem",
    "**/npm-debug.log*",
    "**/yarn-debug.log*",
    "**/yarn-error.log*",
    "**/.env*",
    ".migration-backup/**",
    "client/configs/client.ts",
    "server/configs/server.ts",
    "**/.vercel/**",
    "**/*.tsbuildinfo",
    "**/next-env.d.ts",
    "server/.temporary/**",
    "server/.static/**",
  ]),
  ...scope([...nextVitals, ...nextTypescript], clientFiles),
  ...scope(tailwindcss?.configs.recommended ?? [], clientFiles),
  {
    files: clientFiles,
    settings: {
      next: { rootDir: fileURLToPath(new URL("./client/", import.meta.url)) },
      tailwindcss: {
        cssConfigPath: fileURLToPath(
          new URL("./client/src/app/globals.css", import.meta.url),
        ),
      },
    },
    rules: clientInstalled ? { "tailwindcss/no-custom-classname": "off" } : {},
  },
  ...scope(
    [js.configs.recommended, ...tsPlugin.configs["flat/recommended"]],
    sharedFiles,
  ),
  {
    ...prettierRecommended,
    files: [...clientFiles, ...sharedFiles],
    plugins: {
      ...prettierRecommended.plugins,
      "simple-import-sort": simpleImportSort,
    },
    rules: {
      ...prettierRecommended.rules,
      "simple-import-sort/imports": "error",
      "simple-import-sort/exports": "error",
    },
  },
]);
