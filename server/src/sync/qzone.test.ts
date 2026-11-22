import { SyncServiceType } from "@timeline/contracts";
import { afterEach, expect, spyOn, test } from "bun:test";
import fs from "fs";

import * as timelineItems from "../database/controller/timeline-item";
import axios from "../utils/axios";
import * as files from "../utils/file";
import * as qzone from "../utils/qzone";
import { createSyncCoordinator } from "./coordinator";
import { syncQQZoneTalks } from "./qzone";

const service = {
  id: "qq",
  type: SyncServiceType.QZONE_TALK as const,
  qqNumber: "123456789",
};

afterEach(() => {
  cookies?.mockRestore();
});

let cookies: ReturnType<typeof spyOn<typeof qzone, "getQZoneCookies">>;

test("missing QQ login credentials yield a concise failure with a recovery link", async () => {
  cookies = spyOn(qzone, "getQZoneCookies").mockReturnValue(undefined);
  const coordinator = createSyncCoordinator(
    () => [service],
    () => syncQQZoneTalks(service),
  );
  coordinator.ready();
  coordinator.start("manual");
  await coordinator.wait();

  const [result] = coordinator.snapshot("qq").history[0].services;
  expect(result).toMatchObject({
    status: "failed",
    qzoneLoginPath: "/qzone-login?qqNumber=123456789",
    error: "QQ 空间尚未扫码登录，请扫码并确认登录。",
  });
});

test("incomplete QQ login credentials also fail", async () => {
  cookies = spyOn(qzone, "getQZoneCookies").mockReturnValue([
    { name: "skey", value: "test-only" },
  ]);
  await expect(syncQQZoneTalks(service)).rejects.toThrow("QQ 空间登录凭据无效");
});

test("the provider's expired login response asks for another QR scan", async () => {
  cookies = spyOn(qzone, "getQZoneCookies").mockReturnValue(
    ["skey", "p_uin", "pt4_token", "p_skey"].map((name) => ({
      name,
      value: "test-only",
    })),
  );
  const lastSync = spyOn(
    timelineItems,
    "getSyncTaskLastExecuteTime",
  ).mockResolvedValue(new Date(0));
  const request = spyOn(axios, "get").mockResolvedValue({
    data: '_preloadCallback({"code":-3000});',
  });
  try {
    await expect(syncQQZoneTalks(service)).rejects.toThrow("QQ 空间登录已失效");
  } finally {
    request.mockRestore();
    lastSync.mockRestore();
  }
});

test("reopening a QR code gives the new poll sole ownership of the login", async () => {
  const ticks: (() => unknown)[] = [];
  const timers: ReturnType<typeof setInterval>[] = [];
  const setRealInterval = setInterval;
  const startInterval = spyOn(globalThis, "setInterval").mockImplementation(
    (tick: () => void) => {
      ticks.push(tick);
      const timer = setRealInterval(() => {}, 60_000);
      timers.push(timer);
      return timer;
    },
  );
  const stopInterval = spyOn(globalThis, "clearInterval");
  const ensureDirectory = spyOn(files, "checkupDir").mockImplementation(
    (directory) => directory,
  );
  const write = spyOn(fs, "writeFileSync").mockImplementation(() => {});
  const oldCheckStarted = Promise.withResolvers<void>();
  const oldCheck = Promise.withResolvers<never>();
  const providerLogin = {
    data: "登录成功 ptsigx=synthetic&",
    headers: { "set-cookie": ["uin=synthetic"] },
  };
  const providerRedirect = {
    response: {
      status: 302,
      headers: { "set-cookie": ["p_skey=synthetic"] },
    },
  };
  const request = spyOn(axios, "get")
    .mockResolvedValueOnce(providerLogin)
    .mockImplementationOnce(() => {
      oldCheckStarted.resolve();
      return oldCheck.promise;
    })
    .mockResolvedValueOnce(providerLogin)
    .mockRejectedValueOnce(providerRedirect);

  try {
    qzone.pollGetQZoneLoginQRCodeScanResult(service.qqNumber, "old-qr");
    const oldTick = ticks[0]();
    await oldCheckStarted.promise;
    qzone.pollGetQZoneLoginQRCodeScanResult(service.qqNumber, "new-qr");
    oldCheck.reject(providerRedirect);
    await oldTick;

    expect(write).not.toHaveBeenCalled();
    expect(stopInterval.mock.calls.some(([timer]) => timer === timers[1])).toBe(
      false,
    );
    await ticks[1]();
    expect(write).toHaveBeenCalledTimes(1);
    expect(stopInterval.mock.calls.at(-1)?.[0]).toBe(timers[1]);
  } finally {
    request.mockRestore();
    write.mockRestore();
    ensureDirectory.mockRestore();
    startInterval.mockRestore();
    stopInterval.mockRestore();
    for (const timer of timers) clearInterval(timer);
  }
});
import "reflect-metadata";
