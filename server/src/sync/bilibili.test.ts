import { SyncServiceType } from "@timeline/contracts";
import axios, { AxiosError, AxiosHeaders } from "axios";
import { expect, spyOn, test } from "bun:test";

import * as timelineItems from "../database/controller/timeline-item";
import { syncBilibiliWorks } from "./bilibili";

test("syncs all works with an anonymous session and saves the list description", async () => {
  const work = {
    aid: 1,
    bvid: "BV1hzqrBtEMP",
    title: "Test video",
    pic: "https://i0.hdslb.com/cover.jpg",
    ctime: 1,
    pubdate: 2,
  };
  const archives = [
    { ...work, desc: "作品简介" },
    { ...work, aid: 2, bvid: "BV1eu4m1N7cL" },
  ];

  const previousAdapter = axios.defaults.adapter;
  const upsert = spyOn(
    timelineItems,
    "insertOrUpdateTimelineItems",
  ).mockImplementation(async (items) => items.length);
  let firstPageBlocked = false;
  axios.defaults.adapter = async (config) => {
    const headers = new AxiosHeaders();
    const response = { config, status: 200, statusText: "OK", headers };
    if (config.url === "https://www.bilibili.com/") {
      headers.set("set-cookie", [
        "buvid3=anonymous; Domain=.bilibili.com; Path=/",
        "b_nut=123; Domain=.bilibili.com; Path=/",
        "unrelated=ignore; Path=/",
      ]);
      return { ...response, data: "" };
    }

    if (config.headers.get("Cookie") !== "buvid3=anonymous; b_nut=123") {
      throw new AxiosError("Request failed with status code 412");
    }
    const page = Number(new URL(axios.getUri(config)).searchParams.get("pn"));
    if (page === 1 && !firstPageBlocked) {
      firstPageBlocked = true;
      return { ...response, status: 412, data: { code: -412 } };
    }
    const archive = archives[page - 1];
    if (!archive) {
      throw new Error("Requested a page past the last work");
    }
    return {
      ...response,
      data: {
        code: 0,
        data: {
          archives: [archive],
          page: { num: page, size: 1, total: 2 },
        },
      },
    };
  };

  try {
    const count = await syncBilibiliWorks({
      id: "bilibili",
      type: SyncServiceType.BILIBILI_WORK,
      userId: "2267573",
      secret: true,
    });
    expect(count).toBe(2);
    expect(upsert.mock.calls[0]?.[0]).toMatchObject([
      { content_id: "1", content: "作品简介", is_secret: true },
      { content_id: "2", content: null, is_secret: true },
    ]);
  } finally {
    axios.defaults.adapter = previousAdapter;
    upsert.mockRestore();
  }
});
