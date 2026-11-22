import {
  mdiDotsHorizontal,
  mdiDrag,
  mdiFolderOutline,
  mdiFolderPlusOutline,
  mdiMerge,
  mdiPencilOutline,
  mdiTrashCanOutline,
} from "@mdi/js";
import Icon from "@mdi/react";
import type {
  CollectionNodeDto,
  CreateCollectionParams,
  MergeCollectionParams,
  MoveCollectionParams,
  RenameCollectionParams,
} from "@timeline/contracts";
import axios from "axios";
import type { RefObject } from "react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { dialogActionClass } from "@/components/Dialog";
import CollectionTree, {
  collectionPath,
  countCollectionDescendants,
} from "@/components/TimelineCollections/tree";
import useTimelineCollections from "@/hooks/useTimelineCollections";
import { fetcherDELETE, fetcherPATCH, fetcherPOST } from "@/services/axios";

type CollectionForm =
  | { type: "create"; parentId: string | null; name: string }
  | { type: "rename"; id: string; name: string }
  | { type: "merge"; id: string; targetValue: string }
  | { type: "delete"; id: string };

type CollectionChange =
  CollectionForm | { type: "move"; id: string; parentId: string | null };

const inputClass =
  "mt-1 block min-h-11 w-full rounded-md border border-control bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-primary";
const rowActionClass =
  "inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1 rounded-md px-2 text-xs font-medium whitespace-nowrap hover:bg-background-lighter focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-default disabled:opacity-50";
const rootName = "全部";
const rootMergeOption = "all";

const SUCCESS_FEEDBACK: Record<CollectionChange["type"], string> = {
  create: "已创建合集。",
  rename: "已重命名合集。",
  move: "已移动合集。",
  merge: "已合并合集。",
  delete: "已删除合集。",
};

function focusField(
  field: HTMLInputElement | HTMLSelectElement | HTMLButtonElement | null,
) {
  field?.focus();
}

function collectionAtPoint(x: number, y: number) {
  const id = document
    .elementFromPoint(x, y)
    ?.closest<HTMLElement>("[data-collection-id]")?.dataset.collectionId;
  return id === "" ? null : id;
}

function CollectionActions({
  name,
  disabled,
  onSelect,
}: {
  name: string;
  disabled: boolean;
  onSelect: (action: "merge" | "delete", trigger: HTMLButtonElement) => void;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  function select(action: "merge" | "delete") {
    menu.current?.hidePopover();
    if (trigger.current) onSelect(action, trigger.current);
  }

  return (
    <div
      className="contents"
      onBlur={(event) => {
        const popup = menu.current;
        if (
          !event.currentTarget.contains(event.relatedTarget) &&
          popup?.matches(":popover-open")
        ) {
          popup.hidePopover();
        }
      }}
    >
      <button
        ref={trigger}
        type="button"
        aria-label={name + "的更多操作"}
        popoverTarget={id}
        disabled={disabled}
        className={`${rowActionClass} size-11 justify-center`}
      >
        <Icon path={mdiDotsHorizontal} className="size-5" aria-hidden="true" />
      </button>
      <div
        ref={menu}
        id={id}
        popover="auto"
        className="inset-auto m-0 min-w-32 rounded-md border border-control bg-background-light p-1 text-foreground shadow-lg [position-area:bottom_span-left] [position-try-fallbacks:flip-block]"
      >
        <button
          type="button"
          className={`${rowActionClass} w-full`}
          onClick={() => select("merge")}
          disabled={disabled}
        >
          <Icon path={mdiMerge} className="size-4" aria-hidden="true" />
          合并到…
        </button>
        <button
          type="button"
          className={`${rowActionClass} w-full text-danger`}
          onClick={() => select("delete")}
          disabled={disabled}
        >
          <Icon
            path={mdiTrashCanOutline}
            className="size-4"
            aria-hidden="true"
          />
          删除合集
        </button>
      </div>
    </div>
  );
}

export default function AdminCollections({
  onChanged,
  scrollRef,
}: {
  onChanged: () => void;
  scrollRef: RefObject<HTMLDivElement | null>;
}) {
  const { data, error, mutate } = useTimelineCollections();
  const [form, setForm] = useState<CollectionForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    text: string;
    type: "status" | "alert";
  }>();
  const draggedId = useRef<string | null>(null);
  const touchPointerId = useRef<number | null>(null);
  const touchPoint = useRef<{ x: number; y: number } | null>(null);
  const scrollFrame = useRef(0);
  const [dropTarget, setDropTarget] = useState<string | null>();
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  const rootCreate = useRef<HTMLButtonElement>(null);
  const byId = new Map(data?.nodes.map((node) => [node.id, node]));
  const targetId = form
    ? form.type === "create"
      ? form.parentId
      : form.id
    : null;
  const missingTarget = Boolean(
    data && targetId !== null && !byId.has(targetId),
  );
  if (missingTarget) {
    setForm(null);
    setFeedback({ type: "alert", text: "所选合集已不存在。" });
  }

  const stopDragging = useCallback(() => {
    cancelAnimationFrame(scrollFrame.current);
    scrollFrame.current = 0;
    touchPointerId.current = null;
    touchPoint.current = null;
    draggedId.current = null;
    setDropTarget(undefined);
  }, []);

  useEffect(() => {
    // A removed handle sends lostpointercapture to the document.
    function onLostPointerCapture(event: PointerEvent) {
      if (touchPointerId.current === event.pointerId) stopDragging();
    }
    document.addEventListener("lostpointercapture", onLostPointerCapture);
    return () => {
      document.removeEventListener("lostpointercapture", onLostPointerCapture);
      cancelAnimationFrame(scrollFrame.current);
    };
  }, [stopDragging]);

  useEffect(() => {
    if (form || saving) return;
    if (returnFocus.current && !returnFocus.current.isConnected) {
      returnFocus.current = rootCreate.current;
    }
    returnFocus.current?.focus();
    returnFocus.current = null;
  }, [form, saving]);

  function open(next: CollectionForm, trigger: HTMLButtonElement) {
    returnFocus.current = trigger;
    setFeedback(undefined);
    setForm(next);
  }

  function cancel() {
    setFeedback(undefined);
    setForm(null);
  }

  async function save(change: CollectionChange) {
    if (saving) return;
    setFeedback(undefined);
    if (
      change.type === "move" &&
      change.parentId !== null &&
      collectionPath(byId, change.parentId).some(({ id }) => id === change.id)
    ) {
      setFeedback({ type: "alert", text: "不能将合集移到自身或后代下" });
      return;
    }
    setSaving(true);
    try {
      if (change.type === "create") {
        await fetcherPOST("/timeline-collections", {
          name: change.name.trim(),
          parentId: change.parentId,
        } satisfies CreateCollectionParams);
      } else if (change.type === "rename") {
        await fetcherPATCH("/timeline-collections/" + change.id + "/name", {
          name: change.name.trim(),
        } satisfies RenameCollectionParams);
      } else if (change.type === "move") {
        await fetcherPATCH("/timeline-collections/" + change.id + "/parent", {
          parentId: change.parentId,
        } satisfies MoveCollectionParams);
      } else if (change.type === "merge") {
        await fetcherPOST("/timeline-collections/" + change.id + "/merge", {
          targetId:
            change.targetValue === rootMergeOption ? null : change.targetValue,
        } satisfies MergeCollectionParams);
      } else {
        await fetcherDELETE("/timeline-collections/" + change.id);
      }
      if (returnFocus.current && change.type !== "create") {
        returnFocus.current = rootCreate.current;
      }
      setFeedback({
        type: "status",
        text: SUCCESS_FEEDBACK[change.type],
      });
      setForm(null);
      onChanged();
    } catch (error) {
      const detail = axios.isAxiosError(error)
        ? error.response?.data
        : undefined;
      setFeedback({
        type: "alert",
        text:
          typeof detail === "string" && detail
            ? detail
            : change.type === "delete"
              ? "删除合集失败，请重试。"
              : change.type === "merge"
                ? "合并合集失败，请重试。"
                : "保存合集失败，请重试。",
      });
    } finally {
      setSaving(false);
    }
  }

  function dropCollection(parentId: string | null | undefined) {
    const id = draggedId.current;
    stopDragging();
    if (!id || parentId === undefined || saving || form) return;
    void save({ type: "move", id, parentId });
  }

  function updateTouchDrag() {
    const point = touchPoint.current;
    if (!point) return;
    const pane = scrollRef.current;
    if (pane) {
      const { top, bottom } = pane.getBoundingClientRect();
      if (Math.abs(point.y - top) < 28) pane.scrollTop -= 8;
      else if (Math.abs(point.y - bottom) < 28) pane.scrollTop += 8;
    }
    setDropTarget(collectionAtPoint(point.x, point.y));
    scrollFrame.current = requestAnimationFrame(updateTouchDrag);
  }

  function row(node: CollectionNodeDto | null, itemCount: number) {
    const id = node?.id ?? null;
    const name = node?.name ?? rootName;
    return (
      <div
        role="group"
        aria-label={name}
        data-collection-id={id ?? ""}
        draggable={node !== null && !saving && !form}
        onDragStart={(event) => {
          if (touchPointerId.current !== null) {
            event.preventDefault();
            return;
          }
          if (!node || saving || form) return;
          draggedId.current = node.id;
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", node.id);
        }}
        onDragOver={(event) => {
          if (!draggedId.current || saving || form) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          setDropTarget(id);
        }}
        onDragLeave={(event) => {
          if (
            event.relatedTarget instanceof Node &&
            event.currentTarget.contains(event.relatedTarget)
          )
            return;
          setDropTarget(undefined);
        }}
        onDrop={(event) => {
          if (!draggedId.current || saving || form) return;
          event.preventDefault();
          dropCollection(id);
        }}
        onDragEnd={stopDragging}
        className={`flex min-w-0 flex-wrap items-center gap-x-2 rounded-lg border px-2 ${dropTarget === id ? "border-primary bg-background-lighter" : "border-binding bg-background"} ${node && !form ? "sm:cursor-grab" : ""}`}
      >
        <span className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-sm font-medium wrap-anywhere">
          {node ? (
            <span
              title="拖拽移动合集"
              className="grid size-11 shrink-0 touch-none place-items-center select-none"
              onPointerDown={(event) => {
                if (
                  event.pointerType !== "touch" ||
                  !event.isPrimary ||
                  saving ||
                  form
                )
                  return;
                event.currentTarget.setPointerCapture(event.pointerId);
                touchPointerId.current = event.pointerId;
                draggedId.current = node.id;
              }}
              onPointerMove={(event) => {
                if (touchPointerId.current !== event.pointerId) return;
                touchPoint.current = { x: event.clientX, y: event.clientY };
                if (!scrollFrame.current) updateTouchDrag();
              }}
              onPointerUp={(event) => {
                if (touchPointerId.current !== event.pointerId) return;
                dropCollection(
                  touchPoint.current
                    ? collectionAtPoint(event.clientX, event.clientY)
                    : undefined,
                );
              }}
            >
              <Icon
                path={mdiDrag}
                className="size-4 text-foreground-dark"
                aria-hidden="true"
              />
            </span>
          ) : (
            <Icon
              path={mdiFolderOutline}
              className="size-4 shrink-0 text-foreground-dark"
              aria-hidden="true"
            />
          )}
          <span>{name}</span>
          <span className="shrink-0 text-foreground-dark tabular-nums">
            {itemCount}
          </span>
        </span>
        <div className="flex shrink-0 flex-wrap items-center gap-1">
          <button
            ref={node ? undefined : rootCreate}
            type="button"
            aria-label={"在" + name + "下新建子合集"}
            onClick={(event) =>
              open(
                { type: "create", parentId: id, name: "" },
                event.currentTarget,
              )
            }
            disabled={saving}
            className={rowActionClass}
          >
            <Icon
              path={mdiFolderPlusOutline}
              className="size-4"
              aria-hidden="true"
            />
            新建
          </button>
          {node && (
            <>
              <button
                type="button"
                aria-label={"重命名" + name}
                onClick={(event) =>
                  open(
                    { type: "rename", id: node.id, name: node.name },
                    event.currentTarget,
                  )
                }
                disabled={saving}
                className={rowActionClass}
              >
                <Icon
                  path={mdiPencilOutline}
                  className="size-4"
                  aria-hidden="true"
                />
                重命名
              </button>
              <CollectionActions
                name={name}
                disabled={saving}
                onSelect={(type, trigger) =>
                  open(
                    type === "merge"
                      ? { type, id: node.id, targetValue: "" }
                      : { type, id: node.id },
                    trigger,
                  )
                }
              />
            </>
          )}
        </div>
      </div>
    );
  }

  if (error) {
    return (
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
    );
  }
  if (!data)
    return (
      <p role="status" className="text-sm text-foreground-dark">
        正在加载合集…
      </p>
    );

  const isNameForm = form?.type === "create" || form?.type === "rename";
  const targetName =
    form && form.type !== "create" ? byId.get(form.id)?.name : undefined;
  const descendantCount =
    form?.type === "delete"
      ? countCollectionDescendants(data.nodes, form.id)
      : 0;
  const mergeTargets =
    form?.type === "merge"
      ? data.nodes.flatMap(({ id }) => {
          const path = collectionPath(byId, id);
          if (path.some((node) => node.id === form.id)) return [];
          return [
            {
              id,
              label: [rootName, ...path.map(({ name }) => name)].join(" / "),
            },
          ];
        })
      : [];
  const mergeTarget = form?.type === "merge" ? form.targetValue : "";
  const mergeTargetValue =
    mergeTarget === rootMergeOption ||
    mergeTargets.some(({ id }) => id === mergeTarget)
      ? mergeTarget
      : "";
  const canSubmit =
    !saving &&
    (!isNameForm || Boolean(form.name.trim())) &&
    (form?.type !== "merge" || Boolean(mergeTargetValue));

  return (
    <div className="space-y-3 overflow-x-auto">
      {form && !missingTarget && (
        <form
          key={
            form.type === "create"
              ? "create:" + (form.parentId ?? "")
              : form.type + ":" + form.id
          }
          className="space-y-3 rounded-lg border border-binding bg-background p-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (canSubmit) void save(form);
          }}
        >
          {form.type === "create" || form.type === "rename" ? (
            <>
              <p className="text-sm font-medium">
                {form.type === "create"
                  ? `在「${form.parentId === null ? rootName : byId.get(form.parentId)?.name}」下新建子合集`
                  : `重命名「${targetName}」`}
              </p>
              <label className="block text-sm">
                合集名称
                <input
                  ref={focusField}
                  required
                  disabled={saving}
                  value={form.name}
                  onChange={(event) =>
                    setForm({ ...form, name: event.currentTarget.value })
                  }
                  className={inputClass}
                />
              </label>
            </>
          ) : form.type === "merge" ? (
            <>
              <p className="text-sm font-medium">合并「{targetName}」</p>
              <label className="block text-sm">
                目标合集
                <select
                  ref={focusField}
                  required
                  disabled={saving}
                  value={mergeTargetValue}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      targetValue: event.currentTarget.value,
                    })
                  }
                  className={inputClass}
                >
                  <option value="" disabled>
                    请选择目标合集
                  </option>
                  <option value={rootMergeOption}>{rootName}</option>
                  {mergeTargets.map(({ id, label }) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <p className="text-sm text-foreground-dark">
                {mergeTargetValue === rootMergeOption
                  ? "将解除项目在该分支中的归属，并删除该合集及其子合集。"
                  : "将把该合集及其子合集中的项目归入目标合集，并删除原合集及其子合集。"}
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium">删除「{targetName}」</p>
              <p className="text-sm text-foreground-dark">
                {descendantCount > 0
                  ? `将同时删除其下 ${descendantCount} 个子合集，并解除相关条目归属；不会删除任何时间线项本身。`
                  : "将移除该合集并解除相关条目归属；不会删除任何时间线项本身。"}
              </p>
            </>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <button
              ref={form.type === "delete" ? focusField : undefined}
              type="button"
              className={dialogActionClass}
              onClick={cancel}
              disabled={saving}
            >
              取消
            </button>
            <button
              type="submit"
              className={`${dialogActionClass} ${form.type === "delete" ? "border-danger text-danger" : "bg-primary text-on-primary hover:bg-primary-light"}`}
              disabled={!canSubmit}
            >
              {saving
                ? form.type === "delete"
                  ? "正在删除…"
                  : form.type === "merge"
                    ? "正在合并…"
                    : "正在保存…"
                : form.type === "create"
                  ? "创建"
                  : form.type === "rename"
                    ? "保存"
                    : form.type === "merge"
                      ? "确认合并"
                      : "确认删除"}
            </button>
          </div>
        </form>
      )}
      {feedback && (
        <p
          role={feedback.type}
          className={
            feedback.type === "alert"
              ? "text-sm text-danger"
              : "text-sm text-primary-light"
          }
        >
          {feedback.text}
        </p>
      )}
      {row(null, data.totalCount)}
      <CollectionTree
        nodes={data.nodes}
        renderNode={(node) => row(node, node.itemCount)}
      />
    </div>
  );
}
