import { SyncServiceType } from "@timeline/contracts";
import { afterEach, expect, spyOn, test } from "bun:test";

import * as qzone from "../utils/qzone";
import { syncQQZoneTalks } from "./qzone";

afterEach(() => {
  cookies.mockRestore();
});

let cookies: ReturnType<typeof spyOn<typeof qzone, "getQZoneCookies">>;

test("missing QQ login credentials fail before querying data", async () => {
  cookies = spyOn(qzone, "getQZoneCookies").mockReturnValue(undefined);
  await expect(
    syncQQZoneTalks({
      id: "qq",
      type: SyncServiceType.QZONE_TALK,
      qqNumber: "000",
    }),
  ).rejects.toThrow("confirm login");
});

test("incomplete QQ login credentials also fail", async () => {
  cookies = spyOn(qzone, "getQZoneCookies").mockReturnValue([
    {
      name: "skey",
      value: "test-only",
      domain: ".qq.com",
      path: "/",
      expires: -1,
      httpOnly: true,
      secure: true,
      sameSite: "None",
    },
  ]);
  await expect(
    syncQQZoneTalks({
      id: "qq",
      type: SyncServiceType.QZONE_TALK,
      qqNumber: "000",
    }),
  ).rejects.toThrow("confirm login");
});
import "reflect-metadata";
