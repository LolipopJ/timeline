import type { RuntimeLogLevel, RuntimeLogsDto } from "@timeline/contracts";
import { useState } from "react";
import useSWR from "swr";

import useDebounce from "@/hooks/useDebounce";
import { fetcherGET } from "@/services/axios";
import { getSearchParamsFromObject } from "@/utils/searchParams";

const LEVELS: RuntimeLogLevel[] = ["info", "success", "warn", "error"];
const LEVEL_LABELS: Record<RuntimeLogLevel, string> = {
  info: "信息",
  success: "成功",
  warn: "警告",
  error: "错误",
};
const inputClass =
  "mt-1 min-h-11 w-full rounded-lg border border-foreground-dark/30 bg-background px-3 py-2 focus-visible:outline-2 focus-visible:outline-primary";

export default function AdminLogs({ active }: { active: boolean }) {
  const [level, setLevel] = useState<RuntimeLogLevel | undefined>();
  const [textFilters, setTextFilters] = useState({ module: "", q: "" });
  const { module, q } = useDebounce(textFilters, 500);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const key = active
    ? `/admin/logs?${getSearchParamsFromObject({ level, module: module || undefined, q: q || undefined, limit: 100 })}`
    : null;
  const { data, error, mutate, isValidating } = useSWR<RuntimeLogsDto>(
    key,
    fetcherGET,
    {
      refreshInterval: autoRefresh ? 5000 : 0,
      refreshWhenHidden: false,
      revalidateOnFocus: false,
      shouldRetryOnError: false,
      keepPreviousData: false,
      dedupingInterval: 0,
    },
  );

  return (
    <>
      <h2 className="text-base font-semibold">运行日志</h2>
      <p className="mt-1 text-sm leading-relaxed text-foreground-dark">
        按时间从新到旧显示最多 100 条匹配日志。服务端保留最近 500
        条，重启后清空。每条消息最多 4096 字符，超出时标记截断。
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <label className="min-w-0 text-sm font-medium">
          级别
          <select
            className={inputClass}
            value={level ?? ""}
            onChange={(event) =>
              setLevel(LEVELS.find((value) => value === event.target.value))
            }
          >
            <option value="">全部级别</option>
            {LEVELS.map((value) => (
              <option key={value} value={value}>
                {LEVEL_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-0 text-sm font-medium">
          模块
          <input
            className={inputClass}
            value={textFilters.module}
            onChange={(event) =>
              setTextFilters({ ...textFilters, module: event.target.value })
            }
            placeholder="精确匹配"
          />
        </label>
        <label className="col-span-2 min-w-0 text-sm font-medium sm:col-span-1">
          关键词
          <input
            className={inputClass}
            value={textFilters.q}
            onChange={(event) =>
              setTextFilters({ ...textFilters, q: event.target.value })
            }
            placeholder="忽略大小写"
          />
        </label>
      </div>
      <div className="my-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(event) => setAutoRefresh(event.target.checked)}
            className="size-4 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          />
          自动刷新
        </label>
        <button
          type="button"
          disabled={isValidating || !active}
          onClick={() => void mutate()}
          className="min-h-11 cursor-pointer rounded-lg bg-background-lighter px-3 py-2 text-sm font-medium hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-default disabled:opacity-50"
        >
          刷新日志
        </button>
        <span className="text-sm text-foreground-dark">
          {autoRefresh ? "每 5 秒刷新" : "已暂停"}
        </span>
      </div>
      {error && (
        <p role="alert" className="mb-3 text-red-300">
          日志读取失败，请重试刷新。
        </p>
      )}
      {!data && !error && (
        <p className="text-sm text-foreground-dark">正在读取日志…</p>
      )}
      {data?.records.length === 0 && (
        <p className="rounded-xl border border-foreground-dark/25 bg-background p-4 text-sm text-foreground-dark">
          无匹配日志。
        </p>
      )}
      <ol aria-label="运行日志" className="space-y-1">
        {data?.records.map((record) => (
          <li
            key={record.id}
            className="rounded-xl border border-foreground-dark/25 bg-background p-3 sm:p-4"
          >
            <p className="text-xs wrap-break-word text-foreground-dark">
              #{record.id} · {new Date(record.timestamp).toLocaleString()} ·{" "}
              {LEVEL_LABELS[record.level]} · {record.module}
            </p>
            <pre className="mt-2 text-sm wrap-break-word whitespace-pre-wrap">
              {record.message}
            </pre>
          </li>
        ))}
      </ol>
    </>
  );
}
