import type { ItemCollectionsDto } from "@timeline/contracts";
import { useState } from "react";
import useSWR from "swr";

import useTimelineCollections from "@/hooks/useTimelineCollections";
import { fetcherGET, fetcherPATCH } from "@/services/axios";

import CollectionDialog, { dialogActionClass } from "./dialog";
import CollectionTree, { collectionPath } from "./tree";

export default function CollectionEditor({
  itemId,
  onClose,
  onSaved,
}: {
  itemId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<Set<string>>();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const collections = useTimelineCollections();
  const path = "/timeline-items/" + itemId + "/collections";
  const memberships = useSWR<ItemCollectionsDto>(path, fetcherGET, {
    revalidateOnMount: true,
    revalidateOnFocus: false,
    dedupingInterval: 0,
  });

  const nodes = collections.data?.nodes;
  const readError = collections.error || memberships.error;
  const ready =
    nodes !== undefined &&
    memberships.data !== undefined &&
    (!memberships.isValidating || draft !== undefined);
  const byId = new Map(nodes?.map((node) => [node.id, node]));
  const directIds = draft ?? new Set(memberships.data?.collectionIds ?? []);
  const checkedIds = new Set(
    [...directIds].flatMap((id) =>
      collectionPath(byId, id).map((node) => node.id),
    ),
  );

  function changeSelection(id: string, checked: boolean) {
    const next = new Set(directIds);
    if (checked) next.add(id);
    else {
      for (const direct of next) {
        if (collectionPath(byId, direct).some((node) => node.id === id)) {
          next.delete(direct);
        }
      }
    }
    setDraft(next);
  }

  async function save() {
    if (!ready || saving) return;
    setSaving(true);
    setSaveError(false);
    try {
      await fetcherPATCH(path, {
        collectionIds: [...directIds],
      } satisfies ItemCollectionsDto);
    } catch {
      setSaveError(true);
      setSaving(false);
      return;
    }
    onClose();
    onSaved();
  }

  return (
    <CollectionDialog title="编辑合集" onClose={onClose} busy={saving}>
      {readError ? (
        <div className="space-y-2">
          <p role="alert" className="text-sm text-danger">
            合集归属读取失败。
          </p>
          <button
            type="button"
            className={dialogActionClass}
            onClick={() => {
              void collections.mutate();
              void memberships.mutate();
            }}
          >
            重试加载
          </button>
        </div>
      ) : !ready ? (
        <p role="status" className="text-sm text-foreground-dark">
          正在读取归属…
        </p>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <fieldset disabled={saving} className="min-w-0 space-y-2">
            <legend className="font-medium">全部</legend>
            {nodes.length ? (
              <CollectionTree
                nodes={nodes}
                renderNode={({ id, name }) => (
                  <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 py-1 text-sm wrap-anywhere hover:bg-background-lighter">
                    <input
                      type="checkbox"
                      checked={checkedIds.has(id)}
                      onChange={(event) =>
                        changeSelection(id, event.currentTarget.checked)
                      }
                      className="size-5 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    />
                    <span>{name}</span>
                  </label>
                )}
              />
            ) : (
              <p className="text-sm text-foreground-dark">暂无合集。</p>
            )}
          </fieldset>
          {saveError && (
            <p role="alert" className="mt-3 text-sm text-danger">
              保存归属失败，请重试。
            </p>
          )}
          <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-binding pt-3">
            <button
              type="button"
              onClick={onClose}
              className={dialogActionClass}
              disabled={saving}
            >
              取消
            </button>
            <button
              type="submit"
              className={`${dialogActionClass} bg-primary text-on-primary hover:bg-primary-light`}
              disabled={saving}
            >
              {saving ? "正在保存…" : "保存"}
            </button>
          </div>
        </form>
      )}
    </CollectionDialog>
  );
}
