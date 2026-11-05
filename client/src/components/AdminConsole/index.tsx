import {
  mdiClose,
  mdiEyeOutline,
  mdiLogout,
  mdiSync,
  mdiTextBoxOutline,
} from "@mdi/js";
import Icon from "@mdi/react";
import type {
  SyncAcceptedDto,
  SyncRunDto,
  SyncStatusDto,
  SyncUnavailableReason,
} from "@timeline/contracts";
import axios from "axios";
import { useContext, useEffect, useRef, useState } from "react";
import useSWR from "swr";

import GlobalContext from "@/contexts/GlobalContext";
import usePageVisible from "@/hooks/usePageVisible";
import { fetcherGET, fetcherPOST } from "@/services/axios";

import AdminLogs from "./logs";

const REASONS: Record<SyncUnavailableReason, string> = {
  busy: "已有同步正在运行。",
  no_services: "没有启用的同步服务。",
  initializing: "服务端正在初始化。",
  stopping: "服务端正在停止。",
};
const STATUS = {
  running: "运行中",
  succeeded: "执行成功",
  partial: "部分失败",
  failed: "执行失败",
};
const TRIGGER = { manual: "手动", scheduled: "定时", startup: "启动" };
const TABS = ["sync", "logs"] as const;
type Tab = (typeof TABS)[number];
const buttonClass =
  "inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-control px-3 py-2 text-sm font-medium whitespace-nowrap motion-safe:transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-default disabled:opacity-50";
const headerActionClass = `${buttonClass} hover:bg-background-lighter active:bg-background`;

function SyncRun({ run }: { run: SyncRunDto }) {
  return (
    <section
      className="rounded-xl border border-binding bg-background p-4"
      aria-label="同步运行详情"
    >
      <p className="flex flex-wrap items-center gap-2 text-sm text-foreground-dark">
        <span className="rounded-full bg-background-lighter px-2.5 py-1 font-semibold text-foreground">
          {STATUS[run.status]}
        </span>
        {TRIGGER[run.trigger]}同步
      </p>
      <p className="mt-2 text-sm break-all text-foreground-dark">
        运行 {run.id}
      </p>
      <p className="mt-1 text-sm">
        开始：{new Date(run.startedAt).toLocaleString()}
      </p>
      {run.finishedAt && (
        <p className="text-sm">
          结束：{new Date(run.finishedAt).toLocaleString()}
        </p>
      )}
      {run.error && (
        <pre className="mt-2 text-sm wrap-break-word whitespace-pre-wrap text-danger">
          {run.error}
        </pre>
      )}
      <ul className="mt-3 space-y-3">
        {run.services.map((service) => (
          <li key={service.id}>
            <span>
              {service.label || service.id} · {service.type} ·{" "}
              {STATUS[service.status]}
            </span>
            {service.status === "succeeded" && (
              <p className="mt-1 text-sm text-primary">
                新增或更新 {service.itemCount} 条
              </p>
            )}
            {service.status === "failed" && (
              <pre className="mt-1 text-sm wrap-break-word whitespace-pre-wrap text-danger">
                {service.error}
              </pre>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function AdminConsole({
  open,
  onClose,
  onSyncCompleted,
}: {
  open: boolean;
  onClose: () => void;
  onSyncCompleted: () => void;
}) {
  const { canManageItems, setView, logout, isLoggingOut } =
    useContext(GlobalContext);
  const visible = usePageVisible();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({
    sync: null,
    logs: null,
  });
  const active = useRef(false);
  const latestCompletedRun = useRef<string | null | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState("");
  const [acceptedRunId, setAcceptedRunId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("sync");
  const canRead = open && canManageItems && visible;
  const syncKey = canRead && tab === "sync" ? "/admin/sync" : null;
  const { data, error, mutate } = useSWR<SyncStatusDto>(syncKey, fetcherGET, {
    refreshInterval: 2000,
    refreshWhenHidden: false,
    revalidateOnFocus: false,
    shouldRetryOnError: false,
    keepPreviousData: false,
    dedupingInterval: 0,
  });

  useEffect(() => {
    active.current = Boolean(syncKey);
    return () => {
      active.current = false;
    };
  }, [syncKey]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) dialog.showModal();
    else dialog.close();
    return () => dialog.close();
  }, [open]);

  useEffect(() => {
    if (!syncKey || !data) return;
    const previous = latestCompletedRun.current;
    const latest = data.history[0]?.id ?? null;
    latestCompletedRun.current = latest;
    if (previous !== undefined && latest !== null && latest !== previous) {
      onSyncCompleted();
    }
  }, [syncKey, data, onSyncCompleted]);

  const closeDialog = () => {
    dialogRef.current?.close();
    onClose();
  };

  const selectTab = (next: Tab) => {
    if (next === tab) return;
    contentRef.current?.scrollTo({ top: 0 });
    setTab(next);
  };

  const startSync = async () => {
    if (submitting || !data?.available) return;
    setSubmitting(true);
    setNotice("");
    setAcceptedRunId(null);
    try {
      const accepted: SyncAcceptedDto = await fetcherPOST("/admin/sync");
      setAcceptedRunId(accepted.runId);
      setNotice(`同步已受理（${accepted.runId}）。`);
    } catch (error) {
      if (!active.current) return;
      const reason: SyncUnavailableReason | undefined = axios.isAxiosError(
        error,
      )
        ? error.response?.data?.reason
        : undefined;
      setNotice(
        reason && reason in REASONS
          ? REASONS[reason]
          : "受理结果未知，请查看同步状态；不会自动重复提交。",
      );
    } finally {
      setSubmitting(false);
      if (active.current) {
        void mutate();
      }
    }
  };

  return (
    <dialog
      id="admin-console"
      ref={dialogRef}
      aria-labelledby="admin-console-title"
      onCancel={(event) => {
        event.preventDefault();
        closeDialog();
      }}
      className="fixed inset-x-3 top-[max(.75rem,env(safe-area-inset-top))] bottom-[max(.75rem,env(safe-area-inset-bottom))] m-0 size-auto max-h-none max-w-none flex-col overflow-hidden rounded-2xl border border-control bg-background-light text-foreground shadow-2xl backdrop:bg-black/60 open:flex lg:inset-y-0 lg:right-0 lg:left-auto lg:w-[min(100%,46rem)] lg:rounded-none lg:border-y-0 lg:border-r-0"
    >
      <header className="shrink-0 space-y-3 border-b border-binding px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex items-center justify-between gap-4">
          <h1
            id="admin-console-title"
            className="text-xl font-semibold tracking-tight"
          >
            管理面板
          </h1>
          <button
            type="button"
            aria-label="关闭管理面板"
            title="关闭管理面板"
            className={`${headerActionClass} size-11 p-0`}
            onClick={closeDialog}
          >
            <Icon path={mdiClose} size={0.9} aria-hidden="true" />
          </button>
        </div>
        <div className="grid gap-2 sm:flex sm:items-center sm:justify-between">
          <div
            role="tablist"
            aria-label="管理工具"
            className="grid grid-cols-2 gap-1 rounded-xl bg-background p-1"
            onKeyDown={(event) => {
              if (
                !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
              )
                return;
              event.preventDefault();
              const next =
                event.key === "Home"
                  ? "sync"
                  : event.key === "End"
                    ? "logs"
                    : tab === "sync"
                      ? "logs"
                      : "sync";
              selectTab(next);
              tabRefs.current[next]?.focus();
            }}
          >
            {TABS.map((value) => (
              <button
                key={value}
                ref={(element) => {
                  tabRefs.current[value] = element;
                }}
                type="button"
                role="tab"
                id={`admin-${value}-tab`}
                aria-selected={tab === value}
                aria-controls={`admin-${value}-panel`}
                tabIndex={tab === value ? 0 : -1}
                className={`${buttonClass} ${tab === value ? "bg-background-lighter text-primary-light" : "text-foreground-dark hover:bg-background-lighter hover:text-foreground"}`}
                onClick={() => selectTab(value)}
              >
                <Icon
                  path={value === "sync" ? mdiSync : mdiTextBoxOutline}
                  size={0.75}
                  aria-hidden="true"
                />
                {value === "sync" ? "同步" : "日志"}
              </button>
            ))}
          </div>
          <div
            role="group"
            aria-label="会话操作"
            className="grid grid-cols-2 gap-1"
          >
            <button
              type="button"
              className={headerActionClass}
              onClick={() => {
                closeDialog();
                setView("public");
              }}
            >
              <Icon path={mdiEyeOutline} size={0.75} aria-hidden="true" />
              访客预览
            </button>
            <button
              type="button"
              className={headerActionClass}
              disabled={isLoggingOut}
              onClick={() => {
                closeDialog();
                void logout();
              }}
            >
              <Icon path={mdiLogout} size={0.75} aria-hidden="true" />
              {isLoggingOut ? "正在退出…" : "退出登录"}
            </button>
          </div>
        </div>
      </header>
      <div
        ref={contentRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6"
      >
        <section
          role="tabpanel"
          id="admin-sync-panel"
          aria-labelledby="admin-sync-tab"
          tabIndex={0}
          className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          hidden={tab !== "sync"}
        >
          <h2 className="text-base font-semibold">来源同步</h2>
          <p className="mt-1 text-sm leading-relaxed text-foreground-dark">
            手动同步所有已启用来源。当前进程保留最近 10 次已结束的同步记录。
          </p>
          <div className="my-4 flex flex-wrap gap-3">
            <button
              type="button"
              className={`${buttonClass} bg-primary text-on-primary hover:bg-primary-light active:bg-primary disabled:hover:bg-primary`}
              disabled={submitting || !data?.available || Boolean(error)}
              onClick={() => void startSync()}
            >
              开始同步
            </button>
            <button
              type="button"
              className={`${buttonClass} bg-background-lighter hover:bg-background`}
              onClick={() => void mutate()}
            >
              刷新状态
            </button>
          </div>
          {notice && (
            <p role="status" className="mb-4 text-primary-light">
              {data?.history.some(({ id }) => id === acceptedRunId)
                ? "本轮同步已结束，请查看执行结果。"
                : notice}
              {data?.current?.id === acceptedRunId && "正在等待执行结果。"}
            </p>
          )}
          {error && (
            <p role="alert" className="mb-4 text-danger">
              同步状态读取失败，请重试刷新。
            </p>
          )}
          {!data && !error && (
            <p className="text-sm text-foreground-dark">正在读取同步状态…</p>
          )}
          {data?.reason && <p className="mb-4">{REASONS[data.reason]}</p>}
          <div className="space-y-4">
            {data?.current && <SyncRun run={data.current} />}
            {data && data.history.length > 0 && (
              <section
                aria-labelledby="admin-sync-history-title"
                className="space-y-4"
              >
                <h3
                  id="admin-sync-history-title"
                  className="text-sm font-semibold"
                >
                  同步历史
                </h3>
                {data.history.map((run) => (
                  <SyncRun key={run.id} run={run} />
                ))}
              </section>
            )}
            {data && !data.current && data.history.length === 0 && (
              <p className="rounded-xl border border-binding bg-background p-4 text-sm text-foreground-dark">
                当前进程尚无同步记录。
              </p>
            )}
          </div>
        </section>
        <section
          role="tabpanel"
          id="admin-logs-panel"
          aria-labelledby="admin-logs-tab"
          tabIndex={0}
          className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          hidden={tab !== "logs"}
        >
          <AdminLogs active={canRead && tab === "logs"} />
        </section>
      </div>
    </dialog>
  );
}
