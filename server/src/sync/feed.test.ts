import { SyncServiceType } from "@timeline/contracts";
import axios, { AxiosHeaders } from "axios";
import { expect, spyOn, test } from "bun:test";

import * as timelineItems from "../database/controller/timeline-item";
import { syncFeed } from "./feed";

const mockFeedResponse = async (
  xml: string,
  run: (
    upsert: ReturnType<
      typeof spyOn<typeof timelineItems, "insertOrUpdateTimelineItems">
    >,
  ) => Promise<void>,
) => {
  const previousAdapter = axios.defaults.adapter;
  const upsert = spyOn(
    timelineItems,
    "insertOrUpdateTimelineItems",
  ).mockImplementation(async (items) => items.length);
  axios.defaults.adapter = async (config) => ({
    config,
    status: 200,
    statusText: "OK",
    headers: new AxiosHeaders(),
    data: xml,
  });

  try {
    await run(upsert);
  } finally {
    axios.defaults.adapter = previousAdapter;
    upsert.mockRestore();
  }
};

test("extracts RSS enclosure cover images, skips non-images, and applies the from filter", async () => {
  const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:atom="http://www.w3.org/2005/Atom" version="2.0">
  <channel>
    <title><![CDATA[Blog RSS]]></title>
    <link>https://blog.towind.cn</link>
    <item>
      <title><![CDATA[With cover]]></title>
      <description><![CDATA[Post summary]]></description>
      <link>https://blog.towind.cn/posts/with-cover/</link>
      <guid isPermaLink="false">with-cover</guid>
      <pubDate>Mon, 23 Nov 2026 00:00:00 GMT</pubDate>
      <enclosure url="https://blog.towind.cn/static/abc/banner.png" length="2041610" type="image/png" />
      <atom:updated>2026-11-24T00:00:00.000Z</atom:updated>
    </item>
    <item>
      <title><![CDATA[Without cover]]></title>
      <description><![CDATA[Plain summary]]></description>
      <link>https://blog.towind.cn/posts/no-cover/</link>
      <guid isPermaLink="false">no-cover</guid>
      <pubDate>Tue, 24 Nov 2026 00:00:00 GMT</pubDate>
    </item>
    <item>
      <title><![CDATA[Mixed enclosures]]></title>
      <description><![CDATA[Skips audio enclosure]]></description>
      <link>https://blog.towind.cn/posts/mixed/</link>
      <guid isPermaLink="false">mixed</guid>
      <pubDate>Wed, 25 Nov 2026 00:00:00 GMT</pubDate>
      <enclosure url="https://blog.towind.cn/media/episode.mp3" length="12345" type="audio/mpeg" />
      <enclosure url="https://blog.towind.cn/static/def/banner.jpg?v=1" length="72313" type="image/jpeg" />
    </item>
    <item>
      <title><![CDATA[Unsafe or audio only]]></title>
      <description><![CDATA[Ignored enclosure]]></description>
      <link>https://blog.towind.cn/posts/unsafe/</link>
      <guid isPermaLink="false">unsafe</guid>
      <pubDate>Thu, 26 Nov 2026 00:00:00 GMT</pubDate>
      <enclosure url="javascript:alert(1)" type="image/png" />
      <enclosure url="https://blog.towind.cn/media/video.mp4" type="video/mp4" />
    </item>
    <item>
      <title><![CDATA[Before cutoff]]></title>
      <description><![CDATA[Old article]]></description>
      <link>https://blog.towind.cn/posts/old/</link>
      <guid isPermaLink="false">old</guid>
      <pubDate>Sun, 01 Nov 2026 00:00:00 GMT</pubDate>
      <enclosure url="https://blog.towind.cn/static/old/banner.png" type="image/png" />
    </item>
  </channel>
</rss>`;

  await mockFeedResponse(rssXml, async (upsert) => {
    const count = await syncFeed({
      id: "blog",
      type: SyncServiceType.FEED,
      syntax: "rss",
      url: "https://blog.towind.cn/rss.xml",
      from: new Date("2026-11-10T00:00:00.000Z"),
      secret: false,
    });

    expect(count).toBe(4);
    const saved = upsert.mock.calls[0]?.[0];
    expect(saved).toHaveLength(4);
    expect(saved?.[0]).toMatchObject({
      content_id: "with-cover",
      title: "With cover",
      content: "Post summary",
      url: "https://blog.towind.cn/posts/with-cover/",
      attachments: [
        {
          filename: "cover.png",
          url: "https://blog.towind.cn/static/abc/banner.png",
        },
      ],
      created_at: new Date("2026-11-23T00:00:00.000Z"),
      updated_at: new Date("2026-11-24T00:00:00.000Z"),
    });
    expect(saved?.[1]?.attachments).toBeNull();
    expect(saved?.[2]?.attachments).toEqual([
      {
        filename: "cover.jpg",
        url: "https://blog.towind.cn/static/def/banner.jpg?v=1",
      },
    ]);
    expect(saved?.[3]?.attachments).toBeNull();
  });
});

test("parses single-item plain-text RSS and resolves relative enclosure URLs", async () => {
  const singleRss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Single Feed</title>
    <item>
      <title>Plain Title</title>
      <description>Plain description</description>
      <link>https://example.com/posts/single/</link>
      <guid>single-1</guid>
      <pubDate>Mon, 23 Nov 2026 00:00:00 GMT</pubDate>
      <enclosure url="./cover.webp" length="100" />
    </item>
  </channel>
</rss>`;

  await mockFeedResponse(singleRss, async (upsert) => {
    const count = await syncFeed({
      id: "single",
      type: SyncServiceType.FEED,
      syntax: "rss",
      url: "https://example.com/rss.xml",
    });

    expect(count).toBe(1);
    expect(upsert.mock.calls[0]?.[0]?.[0]).toMatchObject({
      content_id: "single-1",
      title: "Plain Title",
      content: "Plain description",
      attachments: [
        {
          filename: "cover.webp",
          url: "https://example.com/posts/single/cover.webp",
        },
      ],
    });
  });
});

test("rejects mismatched feed root when syntax is set to rss", async () => {
  const atomXml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Feed</title>
</feed>`;

  await mockFeedResponse(atomXml, async () => {
    await expect(
      syncFeed({
        id: "mismatch",
        type: SyncServiceType.FEED,
        syntax: "rss",
        url: "https://example.com/atom.xml",
      }),
    ).rejects.toThrow("missing RSS channel");
  });
});
