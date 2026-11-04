import { SyncServiceType } from "@timeline/contracts";
import { describe, expect, spyOn, test } from "bun:test";

import type { SyncService } from "../types/config";
import { createSyncCoordinator } from "./coordinator";

const services: SyncService[] = [
  { id: "feed", type: SyncServiceType.FEED, url: "https://example.com" },
  { id: "other", type: SyncServiceType.FEED, url: "https://example.com" },
  { id: "disabled", type: SyncServiceType.FEED, url: "", enabled: false },
];

describe("sync coordination", () => {
  test("reserves before dispatch, rejects competing triggers and stops accepting", async () => {
    let finish = () => {};
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const calls: SyncService[] = [];
    const coordinator = createSyncCoordinator(
      () => services,
      async (service) => {
        calls.push(service);
        await pending;
      },
    );
    expect(coordinator.start("manual")).toEqual({ reason: "initializing" });
    coordinator.ready();
    const accepted = coordinator.start("startup", true);
    expect(accepted).toHaveProperty("runId");
    expect(coordinator.start("manual")).toEqual({
      reason: "busy",
      runId: "runId" in accepted ? accepted.runId : "",
    });
    const snapshot = coordinator.snapshot();
    snapshot.current!.services[0].status = "failed";
    expect(coordinator.snapshot().current!.services[0].status).toBe("running");
    await Promise.resolve();
    expect(calls).toHaveLength(2);
    expect(calls.every((service) => service.full)).toBe(true);
    coordinator.stop();
    coordinator.ready();
    expect(coordinator.start("scheduled")).toEqual({ reason: "stopping" });
    finish();
    await coordinator.wait();
    expect(coordinator.snapshot().last?.status).toBe("succeeded");
  });

  test.each([0, 1, 2])(
    "aggregates %i failures and can run again",
    async (failures) => {
      const calls: string[] = [];
      const coordinator = createSyncCoordinator(
        () => services,
        (service) => {
          calls.push(service.id);
          if (services.findIndex((item) => item.id === service.id) < failures) {
            throw new Error("credential rejected");
          }
          return Promise.resolve();
        },
      );
      coordinator.ready();
      coordinator.start("scheduled");
      await coordinator.wait();
      const last = coordinator.snapshot().last!;
      expect(last.status).toBe(
        (["succeeded", "partial", "failed"] as const)[failures],
      );
      expect(
        last.services.filter((service) => service.status === "failed"),
      ).toHaveLength(failures);
      expect(last.finishedAt).not.toBeNull();
      expect(coordinator.snapshot().current).toBeNull();
      expect(coordinator.start("manual")).toHaveProperty("runId");
      await coordinator.wait();
      expect(calls).toHaveLength(4);
      expect(JSON.stringify(last)).not.toContain("example.com");
    },
  );

  test("does not create a run when there are no enabled services", () => {
    const coordinator = createSyncCoordinator(
      () => [],
      async () => {},
    );
    coordinator.ready();
    expect(coordinator.start("manual")).toEqual({ reason: "no_services" });
    expect(coordinator.snapshot().last).toBeNull();
    expect(coordinator.snapshot().current).toBeNull();
  });

  test("unexpected coordination errors release the run and allow another", async () => {
    const coordinator = createSyncCoordinator(
      () => services,
      async () => {},
    );
    coordinator.ready();
    const output = spyOn(console, "log").mockImplementationOnce(() => {
      throw new Error("unexpected failure");
    });
    coordinator.start("manual");
    await coordinator.wait();
    output.mockRestore();
    expect(coordinator.snapshot().last?.status).toBe("failed");
    expect(coordinator.start("manual")).toHaveProperty("runId");
    await coordinator.wait();
    expect(coordinator.snapshot().last?.status).toBe("succeeded");
  });
});
