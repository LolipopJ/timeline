import { expect, test } from "bun:test";

import { configValidationError, parseConfigSection } from "../../config.mts";
import { serverConfigSchema } from "./types/config";

const database = {
  user: "test",
  password: "test",
  host: "localhost",
  port: 5432,
  database: "test",
};

test("rejects duplicate keys that become the same AppID", () => {
  const source = `server:
  gameOverrides:
    123456: {}
`;
  expect(parseConfigSection(source, "server")).toEqual({
    gameOverrides: { "123456": {} },
  });
  expect(() =>
    parseConfigSection(`${source}    "123456": {}\n`, "server"),
  ).toThrow("DUPLICATE_KEY");
});

test("rejects a second YAML document", () => {
  const source = "client: {}\n---\nclient: {homepage: second}\n";
  expect(() => parseConfigSection(source, "client")).toThrow("MULTIPLE_DOCS");
});

test("keeps unknown field names and invalid record keys out of diagnostics", () => {
  const secret = "synthetic-private-config-key";
  const result = serverConfigSchema.safeParse({
    database: { ...database, [secret]: true },
    services: [
      {
        id: "steam",
        type: "SteamGameAchievement",
        steamId: "test",
        steamWebAPIKey: "test",
        gameOverrides: { [secret]: {} },
      },
    ],
  });
  if (result.success) throw new Error("Invalid configuration was accepted");

  const { message } = configValidationError("server", result.error.issues);
  expect(message).toContain("server.database");
  expect(message).toContain("server.services.0.gameOverrides");
  expect(message).not.toContain(secret);
});

test("normalizes HTTP(S) origins and rejects credential-incompatible wildcards", () => {
  const server = { database, services: [] };
  const origin = "https://timeline.example.com";
  expect(
    serverConfigSchema.parse({ ...server, allowedOrigin: origin + "/" })
      .allowedOrigin,
  ).toBe(origin);
  expect(
    serverConfigSchema.parse({ ...server, allowedOrigin: true }).allowedOrigin,
  ).toBe(true);
  expect(
    serverConfigSchema.safeParse({ ...server, allowedOrigin: "*" }).success,
  ).toBe(false);
});
