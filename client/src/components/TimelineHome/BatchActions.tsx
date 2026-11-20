import { mdiClose } from "@mdi/js";
import Icon from "@mdi/react";
import type {
  BatchItemCollectionChange,
  BatchTimelineItemsParams,
} from "@timeline/contracts";
import { isAxiosError } from "axios";
import { useId, useState } from "react";

import message from "@/components/Message";
import CollectionDialog, {
  dialogActionClass,
} from "@/components/TimelineCollections/dialog";
import CollectionTree from "@/components/TimelineCollections/tree";
import useTimelineCollections from "@/hooks/useTimelineCollections";
import { fetcherPOST } from "@/services/axios";

const actions = [
  { id: "collections", label: "编辑合集", success: "已更新合集归属" },
  { id: "make-private", label: "设为私密", success: "已将所选条目设为私密" },
  { id: "delete", label: "删除", success: "已删除所选条目" },
] as const;

const collectionActions = [
  { id: "add-collections", label: "添加到合集" },
  { id: "remove-collections", label: "从合集移出" },
] as const;

type BatchAction = (typeof actions)[number];

export default function BatchActions({
  selectedIds,
  onExit,
  onSaved,
}: {
  selectedIds: ReadonlySet<string>;
  onExit: () => void;
  onSaved: () => void;
}) {
  const [action, setAction] = useState<BatchAction>();

  return (
    <div
      role="group"
      aria-label="批量操作"
      className="flex w-full flex-wrap items-center justify-center gap-1.5 rounded-lg border border-control bg-background-light p-2 shadow-lg lg:fixed lg:top-4 lg:left-1/2 lg:w-max lg:-translate-x-1/2"
    >
      <p
        role="status"
        className="mx-1 text-sm font-medium whitespace-nowrap tabular-nums"
      >
        已选 {selectedIds.size} 项
      </p>
      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          aria-haspopup="dialog"
          className={`${dialogActionClass} whitespace-nowrap ${action.id === "delete" ? "text-danger" : ""}`}
          disabled={selectedIds.size === 0}
          onClick={() => setAction(action)}
        >
          {action.label}
        </button>
      ))}
      <button
        type="button"
        aria-label="退出多选"
        title="退出多选"
        className={`${dialogActionClass} grid min-w-11 place-items-center`}
        onClick={onExit}
      >
        <Icon path={mdiClose} className="size-5" aria-hidden="true" />
      </button>
      {action && (
        <BatchActionDialog
          action={action}
          itemIds={[...selectedIds]}
          onClose={() => setAction(undefined)}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}

function BatchActionDialog({
  action,
  itemIds,
  onClose,
  onSaved,
}: {
  action: BatchAction;
  itemIds: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const formId = useId();
  const [change, setChange] = useState<BatchItemCollectionChange>({
    action: "add-collections",
    collectionIds: [],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const collections = useTimelineCollections();
  const editing = action.id === "collections";
  const canSave =
    !saving &&
    (!editing ||
      Boolean(
        collections.data && !collections.error && change.collectionIds.length,
      ));

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setError(undefined);

    const payload: BatchTimelineItemsParams =
      action.id === "collections"
        ? { ...change, itemIds }
        : { action: action.id, itemIds };
    try {
      await fetcherPOST("/timeline-items/batch", payload);
    } catch (error) {
      const response = isAxiosError(error) ? error.response : undefined;
      setError(
        (response?.status === 400 || response?.status === 404) &&
          typeof response.data === "string"
          ? response.data
          : "批量操作失败，请重试。",
      );
      setSaving(false);
      return;
    }

    message.success(action.success);
    onSaved();
  }

  return (
    <CollectionDialog
      title={action.label}
      onClose={onClose}
      busy={saving}
      footer={
        <>
          {error && (
            <p role="alert" className="mb-3 text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className={dialogActionClass}
              onClick={onClose}
              disabled={saving}
            >
              取消
            </button>
            <button
              type="submit"
              form={formId}
              className={`${dialogActionClass} ${action.id === "delete" ? "text-danger" : "bg-primary text-on-primary hover:bg-primary-light"}`}
              disabled={!canSave}
            >
              {saving ? "正在处理…" : editing ? "保存" : "确认"}
            </button>
          </div>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        {editing ? (
          <fieldset disabled={saving} className="min-w-0 space-y-2">
            <legend className="font-medium">
              编辑选中的 {itemIds.length} 个条目
            </legend>
            <div className="flex flex-wrap gap-x-4">
              {collectionActions.map(({ id, label }) => (
                <label
                  key={id}
                  className="flex min-h-11 cursor-pointer items-center gap-2 text-sm"
                >
                  <input
                    type="radio"
                    name="batch-collection-action"
                    checked={change.action === id}
                    className="size-4 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    onChange={() =>
                      setChange({ action: id, collectionIds: [] })
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
            {change.action === "remove-collections" && (
              <p className="text-sm text-foreground-dark">
                所选合集及其子合集中的归属都会移除。
              </p>
            )}
            {collections.error ? (
              <div className="space-y-2">
                <p role="alert" className="text-sm text-danger">
                  合集读取失败。
                </p>
                <button
                  type="button"
                  className={dialogActionClass}
                  onClick={() => void collections.mutate()}
                >
                  重试加载
                </button>
              </div>
            ) : collections.data === undefined ? (
              <p role="status" className="text-sm text-foreground-dark">
                正在加载合集…
              </p>
            ) : collections.data.nodes.length ? (
              <CollectionTree
                nodes={collections.data.nodes}
                renderNode={({ id, name }) => (
                  <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 py-1 text-sm wrap-anywhere hover:bg-background-lighter">
                    <input
                      type="checkbox"
                      checked={change.collectionIds.includes(id)}
                      className="size-5 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                      onChange={(event) => {
                        const checked = event.currentTarget.checked;
                        setChange((current) => ({
                          ...current,
                          collectionIds: checked
                            ? [...current.collectionIds, id]
                            : current.collectionIds.filter(
                                (selected) => selected !== id,
                              ),
                        }));
                      }}
                    />
                    <span>{name}</span>
                  </label>
                )}
              />
            ) : (
              <p className="text-sm text-foreground-dark">暂无合集。</p>
            )}
          </fieldset>
        ) : (
          <p>
            {action.id === "delete"
              ? `删除选中的 ${itemIds.length} 个条目？`
              : `将选中的 ${itemIds.length} 个条目设为私密？`}
          </p>
        )}
      </form>
    </CollectionDialog>
  );
}
