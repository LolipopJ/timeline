import { mdiDrag, mdiFolderOutline, mdiFolderPlusOutline } from "@mdi/js";
import Icon from "@mdi/react";
import type {
  CollectionNodeDto,
  CreateCollectionParams,
  MoveCollectionParams,
} from "@timeline/contracts";
import axios from "axios";
import { useEffect, useRef, useState } from "react";

import { dialogActionClass } from "@/components/TimelineCollections/dialog";
import CollectionTree, {
  collectionPath,
} from "@/components/TimelineCollections/tree";
import useTimelineCollections from "@/hooks/useTimelineCollections";
import { fetcherPATCH, fetcherPOST } from "@/services/axios";

type CollectionForm =
  | { type: "create"; parentId: string | null; name: string }
  | { type: "move"; id: string; parentId: string | null };

const inputClass =
  "mt-1 block min-h-11 w-full rounded-md border border-control bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-primary";
const rowActionClass =
  "inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1 rounded-md px-2 text-xs font-medium whitespace-nowrap hover:bg-background-lighter focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-default disabled:opacity-50";
const rootName = "全部";

function focusField(field: HTMLInputElement | HTMLSelectElement | null) {
  field?.focus();
}

export default function AdminCollections({
  onChanged,
}: {
  onChanged: () => void;
}) {
  const { data, error, mutate } = useTimelineCollections();
  const [form, setForm] = useState<CollectionForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    text: string;
    type: "status" | "alert";
  }>();
  const draggedId = useRef<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>();
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  const rootCreate = useRef<HTMLButtonElement>(null);
  const byId = new Map(data?.nodes.map((node) => [node.id, node]));

  useEffect(() => {
    if (form || saving) return;
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

  async function save(change: CollectionForm) {
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
      } else {
        await fetcherPATCH("/timeline-collections/" + change.id + "/parent", {
          parentId: change.parentId,
        } satisfies MoveCollectionParams);
        if (returnFocus.current) returnFocus.current = rootCreate.current;
      }
      setFeedback({
        type: "status",
        text: change.type === "create" ? "已创建合集。" : "已移动合集。",
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
            : "保存合集失败，请重试。",
      });
    } finally {
      setSaving(false);
    }
  }

  function stopDragging() {
    draggedId.current = null;
    setDropTarget(undefined);
  }

  function row(node: CollectionNodeDto | null, itemCount: number) {
    const id = node?.id ?? null;
    const name = node?.name ?? rootName;
    return (
      <div
        role="group"
        aria-label={name}
        draggable={node !== null && !saving && !form}
        onDragStart={(event) => {
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
          const source = draggedId.current;
          stopDragging();
          void save({ type: "move", id: source, parentId: id });
        }}
        onDragEnd={stopDragging}
        className={`flex min-w-0 flex-wrap items-center gap-x-2 rounded-lg border px-2 ${dropTarget === id ? "border-primary bg-background-lighter" : "border-binding bg-background"} ${node && !form ? "sm:cursor-grab" : ""}`}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2 py-2 text-sm font-medium wrap-anywhere">
          <Icon
            path={node ? mdiDrag : mdiFolderOutline}
            className="size-4 shrink-0 text-foreground-dark"
            aria-hidden="true"
          />
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
            <button
              type="button"
              aria-label={"移动" + name + "到…"}
              onClick={(event) =>
                open(
                  { type: "move", id: node.id, parentId: node.parentId },
                  event.currentTarget,
                )
              }
              disabled={saving}
              className={rowActionClass}
            >
              移动到…
            </button>
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

  return (
    <div className="space-y-3 overflow-x-auto">
      {form && (
        <form
          className="space-y-3 rounded-lg border border-binding bg-background p-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (form.type === "create" && !form.name.trim()) return;
            void save(form);
          }}
        >
          {form.type === "create" ? (
            <>
              <p className="text-sm font-medium">
                在「
                {form.parentId === null
                  ? rootName
                  : byId.get(form.parentId)?.name}
                」下新建子合集
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
          ) : (
            <>
              <p className="text-sm font-medium">
                移动「{byId.get(form.id)?.name}」
              </p>
              <label className="block text-sm">
                目标父级
                <select
                  ref={focusField}
                  disabled={saving}
                  value={form.parentId ?? ""}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      parentId: event.currentTarget.value || null,
                    })
                  }
                  className={inputClass}
                >
                  <option value="">{rootName}</option>
                  {data.nodes.map(({ id }) => (
                    <option key={id} value={id}>
                      {collectionPath(byId, id)
                        .map(({ name }) => name)
                        .join(" / ")}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className={dialogActionClass}
              onClick={cancel}
              disabled={saving}
            >
              取消
            </button>
            <button
              type="submit"
              className={`${dialogActionClass} bg-primary text-on-primary hover:bg-primary-light`}
              disabled={saving || (form.type === "create" && !form.name.trim())}
            >
              {saving ? "正在保存…" : form.type === "create" ? "创建" : "移动"}
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
