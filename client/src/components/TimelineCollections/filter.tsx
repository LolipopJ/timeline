import { mdiFolderMultipleOutline } from "@mdi/js";
import Icon from "@mdi/react";
import { UNCATEGORIZED_COLLECTION_ID } from "@timeline/contracts";
import { useState } from "react";

import useTimelineCollections from "@/hooks/useTimelineCollections";

import CollectionDialog, { dialogActionClass } from "./dialog";
import CollectionTree from "./tree";

export default function CollectionFilter({
  selection,
  onSelect,
}: {
  selection?: string;
  onSelect: (id?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const { data, error, mutate } = useTimelineCollections();
  const current = data?.nodes.find(({ id }) => id === selection);
  const label =
    selection === UNCATEGORIZED_COLLECTION_ID
      ? "未加入合集"
      : (current?.name ?? (selection && data ? "合集不可用" : "合集"));

  const option = (name: string, itemCount?: number, id?: string) => (
    <button
      type="button"
      aria-pressed={selection === id}
      onClick={() => {
        setOpen(false);
        onSelect(id);
      }}
      className={`flex min-h-11 w-full cursor-pointer items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm wrap-anywhere hover:bg-background-lighter focus-visible:outline-2 focus-visible:outline-primary ${selection === id ? "bg-background-lighter font-semibold text-primary-light" : ""}`}
    >
      <span className="min-w-0">{name}</span>
      {itemCount !== undefined && (
        <span className="shrink-0 text-foreground-dark tabular-nums">
          {itemCount}
        </span>
      )}
    </button>
  );

  return (
    <>
      <button
        type="button"
        aria-label="筛选合集"
        aria-haspopup="dialog"
        aria-expanded={open}
        title={label}
        onClick={(event) => {
          event.currentTarget.focus({ preventScroll: true });
          setOpen(true);
        }}
        className="flex h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-control bg-background-light px-2 text-sm font-medium hover:bg-background-lighter focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:px-3"
      >
        <Icon
          path={mdiFolderMultipleOutline}
          className="size-5 shrink-0"
          aria-hidden="true"
        />
        <span
          className={`max-w-20 truncate sm:max-w-36 lg:max-w-none ${selection ? "" : "max-sm:sr-only"}`}
        >
          {label}
        </span>
      </button>

      {open && (
        <CollectionDialog title="筛选合集" onClose={() => setOpen(false)}>
          <div className="space-y-2">
            {option("全部", data?.totalCount)}
            {data && (
              <CollectionTree
                nodes={data.nodes}
                renderNode={({ id, name, itemCount }) =>
                  option(name, itemCount, id)
                }
              />
            )}
            {data &&
              data.uncategorizedCount > 0 &&
              option(
                "未加入合集",
                data.uncategorizedCount,
                UNCATEGORIZED_COLLECTION_ID,
              )}
            {error ? (
              <div className="space-y-2">
                <p role="alert" className="text-sm text-danger">
                  合集加载失败。
                </p>
                <button
                  type="button"
                  className={dialogActionClass}
                  onClick={() => void mutate()}
                >
                  重试加载
                </button>
              </div>
            ) : (
              !data && (
                <p role="status" className="text-sm text-foreground-dark">
                  正在加载合集…
                </p>
              )
            )}
          </div>
        </CollectionDialog>
      )}
    </>
  );
}
