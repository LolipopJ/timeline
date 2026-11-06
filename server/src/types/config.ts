import { SyncServiceType } from "@timeline/contracts";
import { z } from "zod";

const text = z.string().min(1);
const port = z.int().min(1).max(65535);
const from = z
  .union([z.iso.date(), z.iso.datetime({ offset: true })])
  .transform((value) => new Date(value));

const syncServiceBase = z.strictObject({
  id: text,
  type: z.enum(SyncServiceType),
  enabled: z.boolean().optional(),
  syncInterval: text.optional(),
  label: z.string().optional(),
  from: from.optional(),
  secret: z.boolean().optional(),
  full: z.boolean().optional(),
});

const bilibiliCollection = syncServiceBase.extend({
  type: z.literal(SyncServiceType.BILIBILI_COLLECTION),
  mediaId: text,
});

const bilibiliWork = syncServiceBase.extend({
  type: z.literal(SyncServiceType.BILIBILI_WORK),
  userId: text,
});

const feed = syncServiceBase.extend({
  type: z.literal(SyncServiceType.FEED),
  syntax: z.enum(["atom", "rss"]).optional(),
  url: text,
});

const githubIssueComment = syncServiceBase.extend({
  type: z.literal(SyncServiceType.GITHUB_ISSUE_COMMENT),
  githubPersonalAccessToken: text,
  owner: text,
  repo: text,
  issueNumber: z.int().positive(),
});

const qzoneTalk = syncServiceBase.extend({
  type: z.literal(SyncServiceType.QZONE_TALK),
  qqNumber: text,
});

const steamRecentlyPlayedTime = syncServiceBase.extend({
  type: z.literal(SyncServiceType.STEAM_RECENTLY_PLAYED_TIME),
  steamWebAPIKey: text,
  steamId: text,
});

const steamGameReview = syncServiceBase.extend({
  type: z.literal(SyncServiceType.STEAM_GAME_REVIEW),
  userId: text,
});

const psnGameAchievement = syncServiceBase.extend({
  type: z.literal(SyncServiceType.PSN_GAME_ACHIEVEMENT),
  psnNpsso: text,
  accountId: text.optional(),
});

const xboxGameAchievement = syncServiceBase.extend({
  type: z.literal(SyncServiceType.XBOX_GAME_ACHIEVEMENT),
  xboxClientId: text,
  xboxClientSecret: text,
  xboxTokenStorePath: text,
  xuid: text.optional(),
});

const steamGameAchievement = syncServiceBase.extend({
  type: z.literal(SyncServiceType.STEAM_GAME_ACHIEVEMENT),
  steamWebAPIKey: text,
  steamId: text,
  gameOverrides: z
    .record(
      z.string().regex(/^[1-9]\d*$/),
      z.strictObject({ baseAchievementCount: z.int().positive().optional() }),
    )
    .optional(),
});

const syncService = z.discriminatedUnion("type", [
  bilibiliCollection,
  bilibiliWork,
  feed,
  githubIssueComment,
  qzoneTalk,
  steamRecentlyPlayedTime,
  steamGameReview,
  psnGameAchievement,
  xboxGameAchievement,
  steamGameAchievement,
]);

const allowedOrigin = z
  .union([z.literal(true), z.string()])
  .transform((value, ctx) => {
    if (value === true) return value;
    const url = URL.parse(value);
    if (
      url &&
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.href === `${url.origin}/` &&
      !url.hostname.includes("*")
    ) {
      return url.origin;
    }
    ctx.addIssue({
      code: "custom",
      message:
        "填写单个 HTTP(S) Origin，例如 https://timeline.example.com，或填 true 允许所有来源",
    });
    return z.NEVER;
  });

export const serverConfigSchema = z.strictObject({
  database: z.strictObject({
    user: text,
    password: z.string(),
    host: text,
    port,
    database: text,
  }),
  admin: z
    .strictObject({
      secretKey: text,
      accounts: z.array(z.strictObject({ username: text, password: text })),
    })
    .optional(),
  listeningPort: port.optional(),
  allowedOrigin: allowedOrigin.optional(),
  syncInterval: text.optional(),
  services: z
    .array(syncService)
    .refine(
      (services) =>
        new Set(services.map(({ id }) => id)).size === services.length,
      "来源 id 必须唯一",
    ),
});

export type ServerConfig = z.infer<typeof serverConfigSchema>;
export type SyncService = z.infer<typeof syncService>;
export type SyncServiceBase = z.infer<typeof syncServiceBase>;
export type SyncServiceBilibiliCollection = z.infer<typeof bilibiliCollection>;
export type SyncServiceBilibiliWork = z.infer<typeof bilibiliWork>;
export type SyncServiceFeed = z.infer<typeof feed>;
export type SyncServiceGithubIssueComment = z.infer<typeof githubIssueComment>;
export type SyncServiceQzoneTalk = z.infer<typeof qzoneTalk>;
export type SyncServiceSteamRecentlyPlayedTime = z.infer<
  typeof steamRecentlyPlayedTime
>;
export type SyncServiceSteamGameReview = z.infer<typeof steamGameReview>;
export type SyncServicePsnGameAchievement = z.infer<typeof psnGameAchievement>;
export type SyncServiceXboxGameAchievement = z.infer<
  typeof xboxGameAchievement
>;
export type SyncServiceSteamGameAchievement = z.infer<
  typeof steamGameAchievement
>;

export interface TimelineItemAttachment {
  /** 文件名 */
  filename: string;
  /** 文件链接 */
  url: string;
  /** 文件封面链接 */
  coverUrl?: string;
  /** Date before persistence, ISO string when read from the JSON column. */
  created_at?: Date | string;
  updated_at?: Date | string;
}
